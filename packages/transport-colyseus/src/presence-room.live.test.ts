import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ColyseusTestServer } from "@colyseus/testing";
import type { GameId, GameModule, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import {
  createGameModuleRegistry,
  createJtiReplayGuard,
  createMatchmakingPool,
  createRateLimiter,
  createSessionTokenIssuer,
  createStaticTenantRepository,
} from "@hexdev/platform-core";
import type { SessionTokenIssuer, TenantId } from "@hexdev/platform-core";
import { PresenceRoom } from "./presence-room.js";
import { createMatchServer } from "./server.js";

/**
 * Deliberately non-truco (same reasoning as `match-room.test.ts`'s fixture):
 * two `configOptions` values, proving the lobby derives its modalities
 * generically instead of a hardcoded "pointsToWin" name (roadmap constraint,
 * obs 2943 — Escoba/Generala are next and must need zero lobby changes).
 */
const fixtureModule: GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> = {
  id: "fixture-lobby",
  metadata: { seatCount: 2, displayNameKey: "fixture.lobby", assetBase: "/fixture" },
  configOptions: [{ key: "roundLength", labelKey: "fixture.roundLength", values: [15, 30], defaultValue: 15 }],
  createMatch: (_config, seats: readonly SeatAssignment[]) => ({ seats }),
  applyAction: (state) => ({ ok: true, state }),
  getLegalActions: () => [],
  getViewFor: (state) => state,
  getOutcome: () => null,
  serialize: (state) => state as never,
  deserialize: (json) => json,
  createBot: () => ({ chooseAction: async () => ({ playerId: "bot" as PlayerId }) }),
};

/**
 * "A pairing mechanism proven only against fakes is weak evidence" (apply
 * prompt) — two REAL clients, over a REAL websocket, get REALLY paired.
 */
describe("PresenceRoom — live WebSocket pairing (design §8, spec: Human-vs-Human Matchmaking)", () => {
  let testServer: ColyseusTestServer;
  // See `server.live.test.ts` for the full explanation: `boot()` silently
  // ignores its `port` argument for a raw `Server` instance and always
  // binds 2568 internally, which collided with that other live-socket file
  // once both ran in the same suite (found from-clean, not assumed). Listen
  // on our own distinctly-ranged port ourselves, bypassing that path.
  let nextPort = 2600;

  beforeEach(async () => {
    const registry = createGameModuleRegistry([fixtureModule]);
    const pool = createMatchmakingPool();
    // A pairing now ALWAYS attempts a real hand-off into a "match" room
    // (this unit's whole point), so this lobby-only fixture needs one
    // registered too — these tests never consume the reservation, so a
    // minimal/unused auth stack is enough (`MatchRoom.onAuth` only runs at
    // live-join time, never at `createRoom`/`reserveSeatFor`).
    const httpServer = createServer();
    const auth = {
      issuer: createSessionTokenIssuer("fixture-secret"),
      repository: createStaticTenantRepository([]),
      replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }),
      joinRateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
      allowedWidgetOrigins: [],
    };
    const gameServer = createMatchServer({ httpServer, registry, auth, rng: () => 0.5 });
    gameServer.define("presence", PresenceRoom, { registry, pool } as never);
    await gameServer.listen(nextPort++);
    testServer = new ColyseusTestServer(gameServer);
  });

  afterEach(async () => {
    await testServer.shutdown();
  });

  it("pairs two real waiting clients in the same modality and removes both from the live counter", async () => {
    const room = await testServer.createRoom("presence", { gameId: "fixture-lobby" });
    const client0 = await testServer.connectTo(room, { modality: { roundLength: 15 }, playerId: "p0" });
    const counts0: unknown[] = [];
    client0.onMessage("counts", (message) => counts0.push(message));
    const paired0: unknown[] = [];
    client0.onMessage("paired", (message) => paired0.push(message));

    await new Promise((resolve) => setTimeout(resolve, 30)); // let the first "counts" broadcast land

    const client1 = await testServer.connectTo(room, { modality: { roundLength: 15 }, playerId: "p1" });
    const paired1: unknown[] = [];
    client1.onMessage("paired", (message) => paired1.push(message));

    await new Promise((resolve) => setTimeout(resolve, 60));

    // `matchReservation` (the new hand-off, this unit) is asserted in its own
    // dedicated describe block below — this one still proves pairing itself.
    expect(paired0[0]).toMatchObject({ opponentPlayerId: "p1", modality: { roundLength: 15 } });
    expect(paired1[0]).toMatchObject({ opponentPlayerId: "p0", modality: { roundLength: 15 } });
    const lastCounts = counts0[counts0.length - 1] as Array<{ modality: { roundLength: number }; waitingCount: number }>;
    expect(lastCounts.find((entry) => entry.modality.roundLength === 15)?.waitingCount).toBe(0);
  });

  it("keeps two different modalities independent: a lone waiting client in a different modality is never paired", async () => {
    const room = await testServer.createRoom("presence", { gameId: "fixture-lobby" });
    const client0 = await testServer.connectTo(room, { modality: { roundLength: 15 }, playerId: "p0" });
    const paired0: unknown[] = [];
    client0.onMessage("paired", (message) => paired0.push(message));
    await testServer.connectTo(room, { modality: { roundLength: 30 }, playerId: "p1" });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(paired0).toHaveLength(0);
  });

  /**
   * The selection screen (spec: "Lobby Presence Counters Per Point-Target
   * Room") must show live counts for EVERY modality of a game BEFORE a
   * player has committed to any one of them — but `onJoin` above enqueues
   * the instant a `modality` is supplied. A join with `modality` OMITTED is
   * the watch-only path: this client still receives every `"counts"`
   * broadcast (design §8: the server always publishes the true count to
   * everyone in the room) but is never added to any queue and can never be
   * paired — closing the gap `@hexdev/transport-colyseus-client`'s
   * `watchPresence` needed and this room's own onJoin contract did not yet
   * support (the recurring "wiring a real consumer reveals the primitive
   * doesn't fully fit" pattern, tasks obs 2925 PLAN CORRECTION history).
   */
  it("a watch-only join (no modality) receives live counts but is never enqueued or paired", async () => {
    const room = await testServer.createRoom("presence", { gameId: "fixture-lobby" });
    const watcher = await testServer.connectTo(room, {});
    const counts: unknown[] = [];
    watcher.onMessage("counts", (message) => counts.push(message));
    const paired: unknown[] = [];
    watcher.onMessage("paired", (message) => paired.push(message));

    await new Promise((resolve) => setTimeout(resolve, 30));
    const before = counts[counts.length - 1] as Array<{ modality: { roundLength: number }; waitingCount: number }>;
    expect(before.find((entry) => entry.modality.roundLength === 15)?.waitingCount).toBe(0);

    // A real queued client joins the SAME modality: the watcher must see the
    // count change (it is genuinely subscribed) without ever being a
    // candidate for pairing itself.
    await testServer.connectTo(room, { modality: { roundLength: 15 }, playerId: "p0" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const after = counts[counts.length - 1] as Array<{ modality: { roundLength: number }; waitingCount: number }>;
    expect(after.find((entry) => entry.modality.roundLength === 15)?.waitingCount).toBe(1);
    expect(paired).toHaveLength(0);
  });
});

/**
 * The second Phase-5 gap disclosed in apply-progress: a pairing notified both
 * clients but never actually seated them in a `MatchRoom`. This proves the
 * hand-off end-to-end — real pairing → real seat reservation → real
 * `MatchRoom` join → a real action applied — AND that `MatchRoom.onAuth`
 * still governs entry: the hand-off must never become a second, weaker path
 * to identity.
 */
interface HandoffState {
  readonly players: readonly [PlayerId, PlayerId];
  readonly moves: number;
}
type HandoffAction = { readonly type: "move"; readonly playerId: PlayerId };
const HANDOFF_GAME_ID = "fixture-handoff" as GameId;

const handoffModule: GameModule<HandoffState, HandoffAction, HandoffState, unknown> = {
  id: HANDOFF_GAME_ID,
  metadata: { seatCount: 2, displayNameKey: "fixture.handoff", assetBase: "/fixture" },
  configOptions: [{ key: "roundLength", labelKey: "fixture.roundLength", values: [15, 30], defaultValue: 15 }],
  createMatch: (_config, seats: readonly SeatAssignment[]) => {
    const sorted = [...seats].sort((a, b) => a.seat - b.seat);
    return { players: [sorted[0]!.playerId, sorted[1]!.playerId], moves: 0 };
  },
  applyAction: (state) => ({ ok: true, state: { ...state, moves: state.moves + 1 } }),
  getLegalActions: (state, playerId) => (state.players[0] === playerId ? [{ type: "move", playerId }] : []),
  getViewFor: (state) => state,
  getOutcome: () => null,
  serialize: (state) => state as never,
  deserialize: (json) => json as unknown as HandoffState,
  createBot: () => ({ chooseAction: async (_view, legal) => legal[0]! }),
};

async function waitForMoves(views: readonly HandoffState[], expected: number, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (views.some((view) => view.moves === expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for moves === ${expected}`);
}

describe("PresenceRoom — hand-off into a MatchRoom after pairing (the unscheduled gap disclosed in apply-progress)", () => {
  const TENANT_ID = "tenant-handoff" as TenantId;
  const ALLOWED_ORIGIN = "https://handoff.example";
  const P0 = "handoff-p0" as PlayerId;
  const P1 = "handoff-p1" as PlayerId;

  let testServer: ColyseusTestServer;
  let issuer: SessionTokenIssuer;
  let nextPort = 2650;

  beforeEach(async () => {
    const registry = createGameModuleRegistry([handoffModule]);
    const pool = createMatchmakingPool();
    const httpServer = createServer();
    issuer = createSessionTokenIssuer("handoff-live-secret");
    const repository = createStaticTenantRepository([
      { id: TENANT_ID, embedKey: "pk_handoff", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: [HANDOFF_GAME_ID] },
    ]);
    const auth = {
      issuer,
      repository,
      replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }),
      joinRateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
      allowedWidgetOrigins: [ALLOWED_ORIGIN],
    };
    const gameServer = createMatchServer({ httpServer, registry, auth, rng: () => 0.5 });
    gameServer.define("presence", PresenceRoom, { registry, pool } as never);
    await gameServer.listen(nextPort++);
    testServer = new ColyseusTestServer(gameServer);
    testServer.sdk.http.options.headers = { origin: ALLOWED_ORIGIN };
  });

  afterEach(async () => {
    await testServer.shutdown();
  });

  it("seats two paired real clients in the SAME real MatchRoom, each authenticated via their own token, and applies a submitted action", async () => {
    const token0 = await issuer.mint({ tenantId: TENANT_ID, playerId: P0, entitlements: [HANDOFF_GAME_ID] }, 60);
    const token1 = await issuer.mint({ tenantId: TENANT_ID, playerId: P1, entitlements: [HANDOFF_GAME_ID] }, 60);

    const presenceRoom = await testServer.createRoom("presence", { gameId: HANDOFF_GAME_ID });
    const client0 = await testServer.connectTo(presenceRoom, { modality: { roundLength: 15 }, playerId: P0, token: token0 });
    const paired0: Array<{ opponentPlayerId: string; matchReservation: unknown }> = [];
    client0.onMessage("paired", (message) => paired0.push(message));
    const client1 = await testServer.connectTo(presenceRoom, { modality: { roundLength: 15 }, playerId: P1, token: token1 });
    const paired1: Array<{ opponentPlayerId: string; matchReservation: unknown }> = [];
    client1.onMessage("paired", (message) => paired1.push(message));

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(paired0[0]?.opponentPlayerId).toBe(P1);
    expect(paired1[0]?.opponentPlayerId).toBe(P0);

    const matchRoom0 = await testServer.sdk.consumeSeatReservation<HandoffState>(paired0[0]!.matchReservation as never);
    const views0: HandoffState[] = [];
    matchRoom0.onMessage("view", (message: { view: HandoffState }) => views0.push(message.view));
    const matchRoom1 = await testServer.sdk.consumeSeatReservation<HandoffState>(paired1[0]!.matchReservation as never);

    expect(matchRoom0.roomId).toBe(matchRoom1.roomId); // same real MatchRoom, not two different ones

    matchRoom0.send("action", { type: "move", playerId: P0 });
    await waitForMoves(views0, 1);
    expect(views0.some((view) => view.moves === 1)).toBe(true);
  });

  it("still enforces MatchRoom.onAuth after the hand-off: a reservation consumed without a valid token is rejected, never silently seated", async () => {
    const presenceRoom = await testServer.createRoom("presence", { gameId: HANDOFF_GAME_ID });
    // client0 joins the LOBBY with NO token at all (allowed — PresenceRoom
    // itself has no join-time auth); client1 has a real one so pairing occurs.
    const client0 = await testServer.connectTo(presenceRoom, { modality: { roundLength: 15 }, playerId: P0 });
    const paired0: Array<{ matchReservation: unknown }> = [];
    client0.onMessage("paired", (message) => paired0.push(message));
    const token1 = await issuer.mint({ tenantId: TENANT_ID, playerId: P1, entitlements: [HANDOFF_GAME_ID] }, 60);
    await testServer.connectTo(presenceRoom, { modality: { roundLength: 15 }, playerId: P1, token: token1 });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(paired0).toHaveLength(1); // PresenceRoom still paired them...
    // ...but the hand-off is NOT a second identity path: consuming the
    // reservation with no token still fails MatchRoom's real onAuth.
    await expect(testServer.sdk.consumeSeatReservation(paired0[0]!.matchReservation as never)).rejects.toBeDefined();
  });
});
