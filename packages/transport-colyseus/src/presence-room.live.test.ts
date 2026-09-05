import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColyseusTestServer } from "@colyseus/testing";
import { Room } from "@colyseus/core";
import type { GameId, GameModule, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import {
  createGameModuleRegistry,
  createJtiReplayGuard,
  createMatchmakingPool,
  createRateLimiter,
  createSessionTokenIssuer,
  createSessionTokenVerifier,
  createStaticTenantRepository,
  deriveTestSessionSigningKey,
} from "@hexdev/platform-core";
import type { SessionTokenIssuerHandle, TenantId } from "@hexdev/platform-core";
import { PresenceRoom } from "./presence-room.js";
import { createMatchServer } from "./server.js";
import { LIVE_TEST_TIMEOUT_MS, waitForView } from "./live-wait.test-support.js";

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
  //
  // Disjoint 100-wide bands, one per `*.live.test.ts` port pool, 100 apart
  // (stable window height apply prompt, round 3 — port collisions across
  // concurrently-run live test files): this file alone owns THREE such
  // pools (one per describe block below), each with its own `nextPort`.
  // See `adapter.live.test.ts`'s own doc comment for the full band map.
  let nextPort = 3000;

  beforeEach(async () => {
    const registry = createGameModuleRegistry([fixtureModule]);
    const pool = createMatchmakingPool();
    // A pairing now ALWAYS attempts a real hand-off into a "match" room
    // (this unit's whole point), so this lobby-only fixture needs one
    // registered too — these tests never consume the reservation, so a
    // minimal/unused auth stack is enough (`MatchRoom.onAuth` only runs at
    // live-join time, never at `createRoom`/`reserveSeatFor`).
    const httpServer = createServer();
    const unusedIssuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("fixture-secret"));
    const auth = {
      verifier: await createSessionTokenVerifier(unusedIssuer.publicKey),
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
    // THE COUNTER IS READ THROUGH A WATCHER, which is how the widget reads it:
    // `joinMatchmakingQueue` subscribes to `paired` and `pairing-failed` and
    // to nothing else, so a queued client is not a channel this number ever
    // travelled on outside these fences.
    const counter = await testServer.connectTo(room, { gameId: "fixture-lobby" });
    const counts0: unknown[] = [];
    counter.onMessage("counts", (message) => counts0.push(message));
    const client0 = await testServer.connectTo(room, { gameId: "fixture-lobby", modality: { roundLength: 15 }, playerId: "p0" });
    const paired0: unknown[] = [];
    client0.onMessage("paired", (message) => paired0.push(message));

    await new Promise((resolve) => setTimeout(resolve, 30)); // let the first "counts" broadcast land

    const client1 = await testServer.connectTo(room, { gameId: "fixture-lobby", modality: { roundLength: 15 }, playerId: "p1" });
    const paired1: unknown[] = [];
    client1.onMessage("paired", (message) => paired1.push(message));

    await new Promise((resolve) => setTimeout(resolve, 60));

    // `matchReservation` (the new hand-off, this unit) is asserted in its own
    // dedicated describe block below — this one still proves pairing itself.
    // (PR-2a payload: the full group roster in formation order, recipient
    // included — the SAME shared fact for every member, never a
    // per-recipient "opponent" view; see `handOffToMatch`'s docstring.)
    expect(paired0[0]).toMatchObject({ players: ["p0", "p1"], modality: { roundLength: 15 } });
    expect(paired1[0]).toMatchObject({ players: ["p0", "p1"], modality: { roundLength: 15 } });
    const lastCounts = counts0[counts0.length - 1] as Array<{ modality: { roundLength: number }; waitingCount: number }>;
    expect(lastCounts.find((entry) => entry.modality.roundLength === 15)?.waitingCount).toBe(0);
  }, LIVE_TEST_TIMEOUT_MS);

  it("keeps two different modalities independent: a lone waiting client in a different modality is never paired", async () => {
    const room = await testServer.createRoom("presence", { gameId: "fixture-lobby" });
    const client0 = await testServer.connectTo(room, { gameId: "fixture-lobby", modality: { roundLength: 15 }, playerId: "p0" });
    const paired0: unknown[] = [];
    client0.onMessage("paired", (message) => paired0.push(message));
    await testServer.connectTo(room, { gameId: "fixture-lobby", modality: { roundLength: 30 }, playerId: "p1" });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(paired0).toHaveLength(0);
  }, LIVE_TEST_TIMEOUT_MS);

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
    const watcher = await testServer.connectTo(room, { gameId: "fixture-lobby" });
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
    await testServer.connectTo(room, { gameId: "fixture-lobby", modality: { roundLength: 15 }, playerId: "p0" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const after = counts[counts.length - 1] as Array<{ modality: { roundLength: number }; waitingCount: number }>;
    expect(after.find((entry) => entry.modality.roundLength === 15)?.waitingCount).toBe(1);
    expect(paired).toHaveLength(0);
  }, LIVE_TEST_TIMEOUT_MS);
  /**
   * THE MIRROR OF THE TEST ABOVE, and the one nobody had written.
   *
   * `counts` answers a question only the shelf asks — how many people are
   * waiting in each modality — and a client that has already picked one has
   * left the shelf. It never registers a handler for them
   * (`presence-connection.ts`'s `joinMatchmakingQueue` listens for `paired`
   * and `pairing-failed`, and for nothing else), so every one of these that
   * reached it was a message with nowhere to go: the colyseus SDK said so out
   * loud, once per broadcast, in the console of every player who ever pressed
   * "jugar contra otra persona".
   *
   * TWO BROADCASTS, AND THE SECOND IS THE ONE AN OBVIOUS FIX MISSES. The join
   * itself publishes the new number, and so does the pairing that follows —
   * and `tryFormGroup` deletes a paired player from `waiting` BEFORE it
   * publishes, so "everyone except those still waiting" still includes them.
   * The room sends to the clients that asked to watch instead, which is the
   * only description that stays true at both moments.
   *
   * Reported from real play as a mahjong problem, which it never was: the
   * solitaire is simply the one game whose only control enqueues, so it was
   * the one where it always happened.
   */
  it("never sends counts to a client that enqueued — it asked to play, not to watch", async () => {
    const room = await testServer.createRoom("presence", { gameId: "fixture-lobby" });

    // A watcher first, so the room is genuinely publishing: a fence where
    // nobody would have received anything either way proves nothing.
    const watcher = await testServer.connectTo(room, { gameId: "fixture-lobby" });
    const watched: unknown[] = [];
    watcher.onMessage("counts", (message) => watched.push(message));

    const queued = await testServer.connectTo(room, { gameId: "fixture-lobby", modality: { roundLength: 15 }, playerId: "q0" });
    const leaked: unknown[] = [];
    queued.onMessage("counts", (message) => leaked.push(message));

    // A second player in the same modality, which pairs the two — the moment
    // that produces the broadcast the `except: waiting` shortcut would miss.
    await testServer.connectTo(room, { gameId: "fixture-lobby", modality: { roundLength: 15 }, playerId: "q1" });
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(leaked, "a queued client was sent lobby counts it never asked for").toHaveLength(0);
    expect(watched.length, "the room stopped publishing altogether — this fence would pass on a silent room").toBeGreaterThan(0);
  }, LIVE_TEST_TIMEOUT_MS);

  /**
   * THE SWEEP STOPS SHOUTING THE SAME NUMBERS.
   *
   * The room sweeps once a second and broadcast its counts on every tick,
   * changed or not. Each of those lands on every lobby as a `"counts"` message,
   * and the widget rebuilds its whole selection view on each one -- so an idle
   * lobby with two games was being torn down and rebuilt a couple of times a
   * second for numbers that had not moved.
   *
   * Fixed HERE and not in the widget, deliberately. `renderGameSelection` has a
   * documented reason for rebuilding unconditionally (capture-then-restore over
   * skip-identical-rebuild: one mechanism for both the same-data broadcast and a
   * changed one, no second cache of presence state to drift). That argument is
   * about the CLIENT and it still holds. What was wrong was sending a message
   * that says nothing.
   */
  describe("presence counts are broadcast when they change, not on a timer", () => {
    it("an idle room stops re-sending identical counts, and a later watcher still gets them", async () => {
      // A fast tick so several sweeps really happen inside the wait below.
      const room = await testServer.createRoom("presence", { gameId: "fixture-lobby", sweepTickMs: 20 });
      const watcher = await testServer.connectTo(room, { gameId: "fixture-lobby" });
      const counts: unknown[] = [];
      watcher.onMessage("counts", (message) => counts.push(message));

      // Its own join snapshot: a watcher must never wait for someone else's
      // queue activity to see its first numbers.
      await vi.waitFor(() => {
        expect(counts.length, "the watcher never got its opening snapshot").toBeGreaterThan(0);
      });
      const afterJoin = counts.length;

      // Long enough for many sweeps. Nothing joins, nothing leaves.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(counts.length - afterJoin, `${String(counts.length - afterJoin)} identical broadcasts on an idle room`).toBe(0);

      // AND A LATER WATCHER STILL GETS THEM. This is the half that makes the
      // skip safe: the join path must send even when the numbers have not
      // changed, or a lobby opened during a quiet minute shows nothing at all.
      const late = await testServer.connectTo(room, { gameId: "fixture-lobby" });
      const lateCounts: unknown[] = [];
      late.onMessage("counts", (message) => lateCounts.push(message));
      await vi.waitFor(() => {
        expect(lateCounts.length, "a watcher joining a quiet room saw nothing").toBeGreaterThan(0);
      });

      // A REAL CHANGE STILL TRAVELS.
      const before = counts.length;
      await testServer.connectTo(room, { gameId: "fixture-lobby", modality: { roundLength: 15 }, playerId: "p-late" });
      await vi.waitFor(() => {
        expect(counts.length, "somebody queued and the lobby was never told").toBeGreaterThan(before);
      });
    });
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

const describeHandoff = (view: HandoffState): string => `moves=${String(view.moves)}`;

describe("PresenceRoom — hand-off into a MatchRoom after pairing (the unscheduled gap disclosed in apply-progress)", () => {
  const TENANT_ID = "tenant-handoff" as TenantId;
  const ALLOWED_ORIGIN = "https://handoff.example";
  const P0 = "handoff-p0" as PlayerId;
  const P1 = "handoff-p1" as PlayerId;

  let testServer: ColyseusTestServer;
  let issuer: SessionTokenIssuerHandle;
  // Own disjoint band — see this file's first describe block for the full
  // reasoning and `adapter.live.test.ts` for the complete band map.
  let nextPort = 3100;

  beforeEach(async () => {
    const registry = createGameModuleRegistry([handoffModule]);
    const pool = createMatchmakingPool();
    const httpServer = createServer();
    issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("handoff-live-secret"));
    // `validUntil` far in the future (tenant-administration slice 6): a real
    // join now enforces the validity window (`MatchRoom.onAuth`).
    const repository = createStaticTenantRepository([
      { id: TENANT_ID, embedKey: "pk_handoff", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: [HANDOFF_GAME_ID], validUntil: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 },
    ]);
    const auth = {
      verifier: await createSessionTokenVerifier(issuer.publicKey),
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
    const client0 = await testServer.connectTo(presenceRoom, { gameId: HANDOFF_GAME_ID, modality: { roundLength: 15 }, playerId: P0, token: token0 });
    const paired0: Array<{ players: readonly string[]; matchReservation: unknown }> = [];
    client0.onMessage("paired", (message) => paired0.push(message));
    const client1 = await testServer.connectTo(presenceRoom, { gameId: HANDOFF_GAME_ID, modality: { roundLength: 15 }, playerId: P1, token: token1 });
    const paired1: Array<{ players: readonly string[]; matchReservation: unknown }> = [];
    client1.onMessage("paired", (message) => paired1.push(message));

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(paired0[0]?.players).toEqual([P0, P1]);
    expect(paired1[0]?.players).toEqual([P0, P1]);

    const matchRoom0 = await testServer.sdk.consumeSeatReservation<HandoffState>(paired0[0]!.matchReservation as never);
    const views0: HandoffState[] = [];
    matchRoom0.onMessage("view", (message: { view: HandoffState }) => views0.push(message.view));
    const matchRoom1 = await testServer.sdk.consumeSeatReservation<HandoffState>(paired1[0]!.matchReservation as never);

    expect(matchRoom0.roomId).toBe(matchRoom1.roomId); // same real MatchRoom, not two different ones

    matchRoom0.send("action", { type: "move", playerId: P0 });
    await waitForView({ views: views0, matches: (view) => view.moves === 1, what: "the handed-off match to register its first move", describe: describeHandoff });
    expect(views0.some((view) => view.moves === 1)).toBe(true);
  }, LIVE_TEST_TIMEOUT_MS);

  it("still enforces MatchRoom.onAuth after the hand-off: a reservation consumed without a valid token is rejected, never silently seated", async () => {
    const presenceRoom = await testServer.createRoom("presence", { gameId: HANDOFF_GAME_ID });
    // client0 joins the LOBBY with NO token at all (allowed — PresenceRoom
    // itself has no join-time auth); client1 has a real one so pairing occurs.
    const client0 = await testServer.connectTo(presenceRoom, { gameId: HANDOFF_GAME_ID, modality: { roundLength: 15 }, playerId: P0 });
    const paired0: Array<{ matchReservation: unknown }> = [];
    client0.onMessage("paired", (message) => paired0.push(message));
    const token1 = await issuer.mint({ tenantId: TENANT_ID, playerId: P1, entitlements: [HANDOFF_GAME_ID] }, 60);
    await testServer.connectTo(presenceRoom, { gameId: HANDOFF_GAME_ID, modality: { roundLength: 15 }, playerId: P1, token: token1 });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(paired0).toHaveLength(1); // PresenceRoom still paired them...
    // ...but the hand-off is NOT a second identity path: consuming the
    // reservation with no token still fails MatchRoom's real onAuth.
    await expect(testServer.sdk.consumeSeatReservation(paired0[0]!.matchReservation as never)).rejects.toBeDefined();
  }, LIVE_TEST_TIMEOUT_MS);
});

/**
 * THE DISCLOSED GAP THIS UNIT CLOSES (apply-progress obs 2925/2927, roadmap
 * obs 2943): `gameServer.define("presence", PresenceRoom, ...)` previously had
 * no `filterBy`, so a real client's `joinOrCreate("presence", { gameId })`
 * could be handed ANY already-open "presence" room regardless of which game
 * it was created for — `onJoin` never even read `options.gameId` to notice.
 * Two independent fixture `GameModule`s, deliberately sharing the SAME
 * `configOptions` shape (`roundLength: [15, 30]`), so a false-positive "it
 * only worked because the modality shapes differed" is impossible — isolation
 * here can only come from `gameId`, nothing else.
 */
const isolationModuleA: GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> = {
  id: "fixture-isolation-a",
  metadata: { seatCount: 2, displayNameKey: "fixture.isolation.a", assetBase: "/fixture" },
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

const isolationModuleB: GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> = {
  ...isolationModuleA,
  id: "fixture-isolation-b",
  metadata: { seatCount: 2, displayNameKey: "fixture.isolation.b", assetBase: "/fixture" },
};

describe("PresenceRoom — game isolation over real matchmaking (closes the disclosed filterBy gap, obs 2925/2927/2943)", () => {
  let testServer: ColyseusTestServer;
  // Own distinct port range, same discipline as every sibling describe block
  // in this file (see the first block's own comment for the full rationale).
  let nextPort = 3200;

  beforeEach(async () => {
    // BOTH fixture games share one registry and one matchmaking pool —
    // exactly the real `apps/server` composition root shape once a second
    // game (Escoba/Generala) ships alongside truco.
    const registry = createGameModuleRegistry([isolationModuleA, isolationModuleB]);
    const pool = createMatchmakingPool();
    const httpServer = createServer();
    const unusedIssuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("isolation-secret"));
    const auth = {
      verifier: await createSessionTokenVerifier(unusedIssuer.publicKey),
      repository: createStaticTenantRepository([]),
      replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }),
      joinRateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
      allowedWidgetOrigins: [],
    };
    const gameServer = createMatchServer({ httpServer, registry, auth, rng: () => 0.5 });
    // THE FIX under test: without `.filterBy(["gameId"])`, colyseus's own
    // matchmaker (`findOneRoomAvailable`) ignores `gameId` entirely when
    // selecting among already-open "presence" rooms — see this file's own
    // investigation of `@colyseus/core`'s installed `MatchMaker.ts`/
    // `RegisteredHandler.ts` source (apply-progress, this unit). Verified
    // live: removing this one line reproduces the exact disclosed bug (the
    // very next assertion below fails: `roomA0.roomId === roomB0.roomId`).
    gameServer.define("presence", PresenceRoom, { registry, pool } as never).filterBy(["gameId"]);
    await gameServer.listen(nextPort++);
    testServer = new ColyseusTestServer(gameServer);
  });

  afterEach(async () => {
    await testServer.shutdown();
  });

  it("a client asking for game B never lands in game A's already-open room, is never enqueued/counted/paired into it, and same-game pairing still works", async () => {
    // `sdk.joinOrCreate` — the REAL client-facing matchmaking call
    // (`@hexdev/transport-colyseus-client`'s `watchPresence`/
    // `joinMatchmakingQueue` wrap this exact method), never
    // `testServer.createRoom` (which bypasses room SELECTION entirely and
    // would prove nothing about this defect).
    const roomA0 = await testServer.sdk.joinOrCreate("presence", { gameId: "fixture-isolation-a", modality: { roundLength: 15 }, playerId: "a0" });
    const countsA: Array<Array<{ modality: { roundLength: number }; waitingCount: number }>> = [];
    // Watched from its own join, for the reason the other fences here now
    // state: an enqueued client is not where this number arrives.
    const watcherA = await testServer.sdk.joinOrCreate("presence", { gameId: "fixture-isolation-a" });
    watcherA.onMessage("counts", (message) => countsA.push(message));
    const pairedA0: unknown[] = [];
    roomA0.onMessage("paired", (message) => pairedA0.push(message));

    await new Promise((resolve) => setTimeout(resolve, 30));

    // A game-B client requests the SAME modality VALUE (roundLength: 15) —
    // if segregation were broken, colyseus would hand it game A's already-
    // open room (the exact live bug this unit closes).
    const roomB0 = await testServer.sdk.joinOrCreate("presence", { gameId: "fixture-isolation-b", modality: { roundLength: 15 }, playerId: "b0" });
    const countsB: Array<Array<{ modality: { roundLength: number }; waitingCount: number }>> = [];
    const watcherB = await testServer.sdk.joinOrCreate("presence", { gameId: "fixture-isolation-b" });
    watcherB.onMessage("counts", (message) => countsB.push(message));
    const pairedB0: unknown[] = [];
    roomB0.onMessage("paired", (message) => pairedB0.push(message));

    await new Promise((resolve) => setTimeout(resolve, 60));

    // Segregation: two genuinely different room instances, not one shared room.
    expect(roomA0.roomId).not.toBe(roomB0.roomId);

    // Never counted into the other game's queue: each room's own "counts"
    // broadcast shows exactly its own lone waiting player, never 2.
    const lastCountsA = countsA[countsA.length - 1]!;
    expect(lastCountsA.find((entry) => entry.modality.roundLength === 15)?.waitingCount).toBe(1);
    const lastCountsB = countsB[countsB.length - 1]!;
    expect(lastCountsB.find((entry) => entry.modality.roundLength === 15)?.waitingCount).toBe(1);

    // Never paired cross-game: neither lone client has a same-game partner.
    expect(pairedA0).toHaveLength(0);
    expect(pairedB0).toHaveLength(0);

    // A second REAL game-A client completes a same-game pair, proving normal
    // pairing still works after the fix and that B0's presence never
    // contaminated A's own pool (A0 pairs with A1, not with B0).
    const roomA1 = await testServer.sdk.joinOrCreate("presence", { gameId: "fixture-isolation-a", modality: { roundLength: 15 }, playerId: "a1" });
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(roomA1.roomId).toBe(roomA0.roomId); // same game, same room, real joinOrCreate reuse
    expect(pairedA0).toHaveLength(1);
    expect(pairedA0[0]).toMatchObject({ players: ["a0", "a1"] });
    // B0 is STILL alone: it was never a candidate for A's pairing.
    expect(pairedB0).toHaveLength(0);
  }, LIVE_TEST_TIMEOUT_MS);

  /**
   * Defense in depth (necessary because `filterBy` only governs colyseus's
   * OWN room-selection during `joinOrCreate`/`join` — it says nothing about
   * a client that already knows a specific `roomId` and joins it directly,
   * e.g. `sdk.joinById`, a stale client from before a future refactor, or a
   * hand-crafted join. Without this room-level check, `onJoin` never even
   * read `options.gameId` (the disclosed defect) and would have silently
   * enqueued/counted/paired such a client into the WRONG game's pool.
   */
  it("rejects a hand-crafted join whose claimed gameId disagrees with this room's own, even when it bypasses matchmaking selection entirely", async () => {
    // `testServer.createRoom` + `connectTo` (→ `sdk.joinById`) — deliberately
    // bypasses `filterBy`/`joinOrCreate` selection, simulating a client that
    // already has this specific room's id (matching the prompt's own
    // "stale client or hand-crafted join" framing).
    const roomA = await testServer.createRoom("presence", { gameId: "fixture-isolation-a" });
    // Positive control FIRST, and kept connected: an empty room with zero
    // clients auto-disposes almost immediately (verified live — reversing
    // this order made the room vanish before the second assertion could even
    // attempt its join), so a real honest client stays seated throughout,
    // matching the realistic shape of this attack (a room already has a
    // legitimate occupant; a mismatched client targets it directly).
    await expect(
      testServer.connectTo(roomA, { gameId: "fixture-isolation-a", modality: { roundLength: 15 }, playerId: "honest" }),
    ).resolves.toBeDefined();

    // The new check rejects a MISMATCH, not every join that bypasses
    // `joinOrCreate` — same room, still alive, wrong claimed gameId.
    await expect(
      testServer.connectTo(roomA, { gameId: "fixture-isolation-b", modality: { roundLength: 15 }, playerId: "attacker" }),
    ).rejects.toBeDefined();
  }, LIVE_TEST_TIMEOUT_MS);
});

/**
 * PR-2a (roadmap F2, "4-human matchmaking"): the lobby forms groups of the
 * game's OWN `metadata.seatCount` — read from the registry, the same field
 * `MatchRoom.onCreate` sizes its seats from — and hands the WHOLE group off
 * in two strict phases (reserve ALL N seats; only then tell ANYONE). A
 * 4-seat fixture rather than the real `truco-argentino-2v2` module, for this
 * file's own standing reason (see `fixtureModule` at the top): the lobby
 * must be proven generic, and this package has no dependency on any real
 * game module to borrow one from anyway.
 */
interface GroupState {
  readonly players: readonly PlayerId[];
  readonly moves: number;
}
type GroupAction = { readonly type: "move"; readonly playerId: PlayerId };
const GROUP_GAME_ID = "fixture-group" as GameId;

const groupModule: GameModule<GroupState, GroupAction, GroupState, unknown> = {
  id: GROUP_GAME_ID,
  metadata: { seatCount: 4, displayNameKey: "fixture.group", assetBase: "/fixture" },
  configOptions: [{ key: "roundLength", labelKey: "fixture.roundLength", values: [15, 30], defaultValue: 15 }],
  createMatch: (_config, seats: readonly SeatAssignment[]) => {
    const sorted = [...seats].sort((a, b) => a.seat - b.seat);
    return { players: sorted.map((assignment) => assignment.playerId), moves: 0 };
  },
  applyAction: (state) => ({ ok: true, state: { ...state, moves: state.moves + 1 } }),
  getLegalActions: (state, playerId) => (state.players[0] === playerId ? [{ type: "move", playerId }] : []),
  getViewFor: (state) => state,
  getOutcome: () => null,
  serialize: (state) => state as never,
  deserialize: (json) => json as unknown as GroupState,
  createBot: () => ({ chooseAction: async (_view, legal) => legal[0]! }),
};

interface PairedGroupMessage {
  readonly players: readonly string[];
  readonly matchReservation: unknown;
}

describe("PresenceRoom — N-seat group hand-off (PR-2a: seatCount from module metadata, all-or-nothing two-phase reservation)", () => {
  const TENANT_ID = "tenant-group" as TenantId;
  const ALLOWED_ORIGIN = "https://group.example";
  const PLAYERS: readonly PlayerId[] = ["group-p0" as PlayerId, "group-p1" as PlayerId, "group-p2" as PlayerId, "group-p3" as PlayerId];

  let testServer: ColyseusTestServer;
  let issuer: SessionTokenIssuerHandle;
  // Own disjoint band — 3000/3100/3200 are this file's other describe
  // blocks, 3300–3800 belong to sibling live files; see
  // `adapter.live.test.ts`'s own doc comment for the full band map.
  let nextPort = 3900;

  beforeEach(async () => {
    const registry = createGameModuleRegistry([groupModule]);
    const pool = createMatchmakingPool();
    const httpServer = createServer();
    issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("group-live-secret"));
    // `validUntil` far in the future (tenant-administration slice 6): a real
    // join now enforces the validity window (`MatchRoom.onAuth`).
    const repository = createStaticTenantRepository([
      { id: TENANT_ID, embedKey: "pk_group", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: [GROUP_GAME_ID], validUntil: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 },
    ]);
    const auth = {
      verifier: await createSessionTokenVerifier(issuer.publicKey),
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

  it("hands a full 4-human group off into ONE MatchRoom: every member gets the same 'paired' roster and all four seats get their humans", async () => {
    const presenceRoom = await testServer.createRoom("presence", { gameId: GROUP_GAME_ID });
    const paired: PairedGroupMessage[][] = [[], [], [], []];
    for (const [index, playerId] of PLAYERS.entries()) {
      const token = await issuer.mint({ tenantId: TENANT_ID, playerId, entitlements: [GROUP_GAME_ID] }, 60);
      const client = await testServer.connectTo(presenceRoom, { gameId: GROUP_GAME_ID, modality: { roundLength: 15 }, playerId, token });
      client.onMessage("paired", (message: PairedGroupMessage) => paired[index]!.push(message));
    }

    await new Promise((resolve) => setTimeout(resolve, 150));

    // Every member received exactly one 'paired', carrying the SAME full
    // roster (formation order, recipient included) — one shared fact, not a
    // per-recipient "opponent" view, which stops meaning anything at 4
    // players where two of the others are teammates.
    for (const messages of paired) {
      expect(messages).toHaveLength(1);
      expect(messages[0]!.players).toEqual([...PLAYERS]);
    }

    // All four reservations point into the SAME real MatchRoom...
    const views: GroupState[] = [];
    const matchRooms = [];
    for (const messages of paired) {
      const matchRoom = await testServer.sdk.consumeSeatReservation<GroupState>(messages[0]!.matchReservation as never);
      matchRoom.onMessage("view", (message: { view: GroupState }) => views.push(message.view));
      matchRooms.push(matchRoom);
    }
    expect(new Set(matchRooms.map((matchRoom) => matchRoom.roomId)).size).toBe(1);

    // ...and the match genuinely starts: `MatchRoom` only calls
    // `createMatch` once ALL `metadata.seatCount` seats are filled, so a
    // 4-player view is proof every seat got its human.
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !views.some((view) => view.players.length === 4)) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const started = views.find((view) => view.players.length === 4);
    expect(started).toBeDefined();
    expect([...started!.players].sort()).toEqual([...PLAYERS].sort());
  }, LIVE_TEST_TIMEOUT_MS);

  it("reserving ALL four seats locks the MatchRoom before any member is told: an outsider with a VALID token cannot joinById into the group's room", async () => {
    const presenceRoom = await testServer.createRoom("presence", { gameId: GROUP_GAME_ID });
    const paired: PairedGroupMessage[][] = [[], [], [], []];
    for (const [index, playerId] of PLAYERS.entries()) {
      const token = await issuer.mint({ tenantId: TENANT_ID, playerId, entitlements: [GROUP_GAME_ID] }, 60);
      const client = await testServer.connectTo(presenceRoom, { gameId: GROUP_GAME_ID, modality: { roundLength: 15 }, playerId, token });
      client.onMessage("paired", (message: PairedGroupMessage) => paired[index]!.push(message));
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    const reservation = paired[0]![0]!.matchReservation as { roomId: string };

    // The rogue-join test above proved a MISSING token fails at onAuth.
    // This outsider is the stronger case: its token is perfectly VALID
    // (same tenant, entitled to this game) — it must be refused by the room
    // being FULLY RESERVED (colyseus locks a room whose reserved seats reach
    // `maxClients`; `hasReachedMaxClients()` counts reservations), never by
    // identity, because no seat-theft window may exist between the group's
    // reservations and their consumption.
    const outsiderToken = await issuer.mint({ tenantId: TENANT_ID, playerId: "group-outsider" as PlayerId, entitlements: [GROUP_GAME_ID] }, 60);
    await expect(testServer.sdk.joinById(reservation.roomId, { token: outsiderToken })).rejects.toBeDefined();

    // Positive control: every seat the outsider could not steal is still
    // consumable by its intended member. (All four, deliberately — a room
    // with connected clients only disposes once `_reservedSeats` empties,
    // so leaving reservations unconsumed here would stall `shutdown()` in
    // `afterEach` until their expiry timers fire, past the hook timeout.)
    for (const messages of paired) {
      const matchRoom = await testServer.sdk.consumeSeatReservation(messages[0]!.matchReservation as never);
      expect(matchRoom.roomId).toBe(reservation.roomId);
    }
  }, LIVE_TEST_TIMEOUT_MS);

  it("fails the WHOLE group when one member vanished between the pool pop and the hand-off: everyone still present gets 'pairing-failed', nobody gets 'paired'", async () => {
    const presenceRoom = await testServer.createRoom("presence", { gameId: GROUP_GAME_ID });
    const paired: unknown[][] = [[], [], [], []];
    const failed: Array<Array<{ message: string }>> = [[], [], [], []];
    const clients = [];
    for (const [index, playerId] of PLAYERS.slice(0, 3).entries()) {
      const client = await testServer.connectTo(presenceRoom, { gameId: GROUP_GAME_ID, modality: { roundLength: 15 }, playerId });
      client.onMessage("paired", (message) => paired[index]!.push(message));
      client.onMessage("pairing-failed", (message: { message: string }) => failed[index]!.push(message));
      clients.push(client);
    }

    // Simulate the race this guard exists for (an onLeave/sweep landing
    // between the pool's atomic pop and the hand-off reading `waiting`):
    // the second member is still in the POOL but no longer tracked by the
    // room — driven through the server-side room handle, the same
    // internals-driving discipline the rogue-join test above uses.
    (presenceRoom as unknown as { waiting: Map<string, unknown> }).waiting.delete(clients[1]!.sessionId);

    const client3 = await testServer.connectTo(presenceRoom, { gameId: GROUP_GAME_ID, modality: { roundLength: 15 }, playerId: PLAYERS[3] });
    client3.onMessage("paired", (message) => paired[3]!.push(message));
    client3.onMessage("pairing-failed", (message: { message: string }) => failed[3]!.push(message));

    await new Promise((resolve) => setTimeout(resolve, 150));

    // All-or-nothing: a 4-seat room reserved for only 3 humans would hang
    // forever waiting for a member who can never arrive, so NOBODY is
    // seated (the 2-seat predecessor silently skipped the vanished seat and
    // still paired the survivor — exactly that hang)...
    expect(paired.flat()).toHaveLength(0);
    // ...and every member the room can still reach is told the hand-off
    // failed (the vanished member's tracking entry is exactly what's gone).
    for (const index of [0, 2, 3]) expect(failed[index]).toHaveLength(1);
    expect(failed[1]).toHaveLength(0);
  }, LIVE_TEST_TIMEOUT_MS);

  /**
   * GREEN-FROM-BIRTH PIN (disclosed as such): the mid-loop rollback branch
   * below shipped in this same unit, so this test pins it rather than
   * having driven it RED first. It is self-evidencing about reaching the
   * intended branch, though: the intrusion counter proves the refusal fired
   * on the THIRD match-room reservation — mid-loop, two already granted,
   * the fourth never attempted — not before the loop and not after it.
   *
   * THE INTRUSION, honestly: `matchMaker.reserveSeatFor` resolves through
   * `Room.prototype._reserveSeat` (verified in the installed
   * `@colyseus/core@0.17.46` source — `remoteRoomCall` invokes the method
   * directly on the local room instance), and a `false` return is
   * colyseus's OWN "already full" refusal shape, which `reserveSeatFor`
   * turns into a thrown `SeatReservationError`. Patching that one method —
   * scoped to "match" rooms only (every presence join reserves a seat on
   * the PRESENCE room through the same prototype) and restored in
   * `finally` — is the narrowest seam that fails one SPECIFIC mid-loop
   * reservation while everything else stays real; the `matchMaker` module
   * namespace is frozen (ESM) and cannot be spied upon.
   */
  it("rolls the WHOLE group back when a mid-loop reservation fails (two granted, third refused): nobody gets 'paired', everyone gets 'pairing-failed'", async () => {
    const roomPrototype = Room.prototype as unknown as { _reserveSeat: (...args: unknown[]) => Promise<boolean> };
    const originalReserveSeat = roomPrototype._reserveSeat;
    let matchReserveAttempts = 0;
    let abandonedRoomId: string | undefined;
    roomPrototype._reserveSeat = async function (this: { roomName: string; roomId: string }, ...args: unknown[]): Promise<boolean> {
      if (this.roomName === "match") {
        matchReserveAttempts += 1;
        if (matchReserveAttempts === 3) {
          abandonedRoomId = this.roomId;
          return false;
        }
      }
      return originalReserveSeat.apply(this, args);
    };
    try {
      const presenceRoom = await testServer.createRoom("presence", { gameId: GROUP_GAME_ID });
      const paired: unknown[][] = [[], [], [], []];
      const failed: Array<Array<{ message: string }>> = [[], [], [], []];
      for (const [index, playerId] of PLAYERS.entries()) {
        const token = await issuer.mint({ tenantId: TENANT_ID, playerId, entitlements: [GROUP_GAME_ID] }, 60);
        const client = await testServer.connectTo(presenceRoom, { gameId: GROUP_GAME_ID, modality: { roundLength: 15 }, playerId, token });
        client.onMessage("paired", (message) => paired[index]!.push(message));
        client.onMessage("pairing-failed", (message: { message: string }) => failed[index]!.push(message));
      }

      await new Promise((resolve) => setTimeout(resolve, 150));

      // The refusal genuinely fired MID-loop: reservations 1 and 2 were
      // granted, the 3rd refused, and phase A never attempted a 4th (the
      // hand-off is already committed to failing).
      expect(matchReserveAttempts).toBe(3);
      // All-or-nothing: the two already-granted seats are never delivered...
      expect(paired.flat()).toHaveLength(0);
      // ...and every member is told — all four are still connected here,
      // unlike the vanished-member test above where one tracking entry is
      // gone by design.
      for (const messages of failed) expect(messages).toHaveLength(1);

      // The abandoned room is genuinely gone, not merely rolled back in
      // spirit: a fresh, perfectly VALID token cannot join it by id. No
      // poll needed — `disconnect()` removes the room's listing
      // synchronously as its first act (`matchMaker.driver.remove`,
      // Room.ts:1061 in the installed @colyseus/core@0.17.46), and it ran
      // one statement after the pairing-failed sends this test already
      // waited 150ms past.
      const lateToken = await issuer.mint({ tenantId: TENANT_ID, playerId: "group-late" as PlayerId, entitlements: [GROUP_GAME_ID] }, 60);
      expect(abandonedRoomId).toBeDefined();
      await expect(testServer.sdk.joinById(abandonedRoomId!, { token: lateToken })).rejects.toBeDefined();
    } finally {
      roomPrototype._reserveSeat = originalReserveSeat;
    }
  }, LIVE_TEST_TIMEOUT_MS);

  /**
   * Phase B containment (this amendment's RED-first fix): one member whose
   * connection died during phase A's awaits — so its `send` THROWS in
   * phase B — must never starve the OTHER members of their `paired` nor
   * escape `onJoin` as an unhandled rejection. THE INTRUSION, honestly:
   * the doomed member's server-side `Client.send` is patched to throw
   * (same disclosed discipline as the `_reserveSeat` patch above); its
   * position in formation order (second) matters, because the defect shape
   * is "members AFTER the thrower are starved". Broadcasts use
   * `enqueueRaw`, not `send`, so the lobby's own "counts" traffic is
   * untouched by the patch.
   */
  it("keeps delivering 'paired' to every reachable member when one member's send throws after phase A — and tells nobody the pairing failed, because it did not", async () => {
    const presenceRoom = await testServer.createRoom("presence", { gameId: GROUP_GAME_ID });
    const paired: PairedGroupMessage[][] = [[], [], [], []];
    const failed: unknown[][] = [[], [], [], []];
    const clients: Array<{ readonly sessionId: string }> = [];
    for (const [index, playerId] of PLAYERS.slice(0, 3).entries()) {
      const token = await issuer.mint({ tenantId: TENANT_ID, playerId, entitlements: [GROUP_GAME_ID] }, 60);
      const client = await testServer.connectTo(presenceRoom, { gameId: GROUP_GAME_ID, modality: { roundLength: 15 }, playerId, token });
      client.onMessage("paired", (message: PairedGroupMessage) => paired[index]!.push(message));
      client.onMessage("pairing-failed", (message) => failed[index]!.push(message));
      clients.push(client);
    }
    const serverSideClients = presenceRoom.clients as ReadonlyArray<{ readonly sessionId: string; send: (...args: unknown[]) => void }>;
    const serverSideSecond = serverSideClients.find((seated) => seated.sessionId === clients[1]!.sessionId)!;
    serverSideSecond.send = () => {
      throw new Error("simulated connection dropped between reservation and delivery");
    };

    const token3 = await issuer.mint({ tenantId: TENANT_ID, playerId: PLAYERS[3]!, entitlements: [GROUP_GAME_ID] }, 60);
    const client3 = await testServer.connectTo(presenceRoom, { gameId: GROUP_GAME_ID, modality: { roundLength: 15 }, playerId: PLAYERS[3], token: token3 });
    client3.onMessage("paired", (message: PairedGroupMessage) => paired[3]!.push(message));
    client3.onMessage("pairing-failed", (message) => failed[3]!.push(message));

    await new Promise((resolve) => setTimeout(resolve, 150));

    // Every reachable member got its seat — including the two AFTER the
    // thrower in delivery order, the exact members an uncontained phase B
    // exception starves.
    for (const index of [0, 2, 3]) {
      expect(paired[index]).toHaveLength(1);
      expect(paired[index]![0]!.players).toEqual([...PLAYERS]);
    }
    expect(paired[1]).toHaveLength(0);
    // And no 'pairing-failed' lie to anyone: every seat IS reserved, the
    // delivered reservations are real, and the unreachable member's one
    // simply expires under colyseus's own 15s reservation TTL.
    expect(failed.flat()).toHaveLength(0);
  }, LIVE_TEST_TIMEOUT_MS);
});

/**
 * PR-2b (roadmap F2): the residual `handOffToMatch`'s own docstring names —
 * "a room waiting on a human who will never arrive is the degradation path
 * PR-2b's timeout owns". Humans who waited past `botFillAfterSeconds` in a
 * modality whose game needs MORE than 2 seats are handed off with their
 * remaining seats bot-filled, through the SAME two-phase hand-off, via
 * `MatchRoom`'s EXISTING `botTier` + `humanSeatsNeeded` options — never a
 * second system. A 2-seat sibling module rides along to pin the strict
 * `seatCount > 2` guard: 1v1 must stay byte-for-byte (its lone waiter
 * already has the client-side bot CTA; a 2-seat queue is never bot-filled).
 */
const DUO_GAME_ID = "fixture-duo" as GameId;

const duoModule: GameModule<GroupState, GroupAction, GroupState, unknown> = {
  ...groupModule,
  id: DUO_GAME_ID,
  metadata: { seatCount: 2, displayNameKey: "fixture.duo", assetBase: "/fixture" },
};

describe("PresenceRoom — bot-fill degradation of long-waiting multi-seat queues (PR-2b: the residual handOffToMatch names)", () => {
  const TENANT_ID = "tenant-degrade" as TenantId;
  const ALLOWED_ORIGIN = "https://degrade.example";
  const HUMANS: readonly PlayerId[] = ["degrade-p0" as PlayerId, "degrade-p1" as PlayerId, "degrade-p2" as PlayerId];

  let testServer: ColyseusTestServer;
  let issuer: SessionTokenIssuerHandle;
  // Own disjoint band — 3000/3100/3200/3900 are this file's other describe
  // blocks, 3300–3800 belong to sibling live files (full band map in
  // `adapter.live.test.ts`); 4000 is the next free hundred.
  let nextPort = 4000;

  beforeEach(async () => {
    const registry = createGameModuleRegistry([groupModule, duoModule]);
    const pool = createMatchmakingPool();
    const httpServer = createServer();
    issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("degrade-live-secret"));
    // `validUntil` far in the future (tenant-administration slice 6): a real
    // join now enforces the validity window (`MatchRoom.onAuth`).
    const repository = createStaticTenantRepository([
      { id: TENANT_ID, embedKey: "pk_degrade", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: [GROUP_GAME_ID, DUO_GAME_ID], validUntil: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 },
    ]);
    const auth = {
      verifier: await createSessionTokenVerifier(issuer.publicKey),
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

  /** Drives the degraded match like the existing 4-human test: consume every
   * delivered reservation, then wait for a view proving the match STARTED —
   * `MatchRoom` only calls `createMatch` once ALL `seatCount` seats are
   * filled, so a 4-player view is proof the bots took their seats too. */
  async function consumeAndAwaitStart(reservations: readonly unknown[]): Promise<GroupState> {
    const views: GroupState[] = [];
    for (const reservation of reservations) {
      const matchRoom = await testServer.sdk.consumeSeatReservation<GroupState>(reservation as never);
      matchRoom.onMessage("view", (message: { view: GroupState }) => views.push(message.view));
    }
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !views.some((view) => view.players.length === 4)) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const started = views.find((view) => view.players.length === 4);
    expect(started).toBeDefined();
    return started!;
  }

  /* THE WINDOW HERE IS DELIBERATELY WIDE, and tightening it is how this test
   * starts failing on other people's machines.
   *
   * Degradation fires on the age of the queue's OLDEST waiter (`enqueuedAt` of
   * the first entry — see `presence-room.ts`'s own note that insertion order
   * makes the first tracked entry the oldest). That clock starts the moment
   * the FIRST client joins, and the two after it still have to mint a token
   * and finish a websocket handshake. So the real race is: can three
   * sequential connects finish before the window expires?
   *
   * At `0.05` they could not, on a loaded CI runner, and this failed with
   *     expected [ 'degrade-p0', 'degrade-p1' ]
   *       to deeply equal [ 'degrade-p0', 'degrade-p1', 'degrade-p2' ]
   * — the sweep had degraded a group of TWO, because the third had not
   * arrived yet. Correct product behaviour (degrade whoever is waiting),
   * wrong test setup. It passed five times out of five locally, which is
   * exactly what a race looks like from the machine that is fast enough.
   *
   * The sibling tests below keep a tiny window because they connect ONE
   * client: with a single connect there is nothing to outrun. */
  it("degrades 3 humans waiting past botFillAfterSeconds in a 4-seat modality: all 3 get 'paired' (roster = the 3 humans) and the match starts as 3 humans + 1 bot", async () => {
    const presenceRoom = await testServer.createRoom("presence", { gameId: GROUP_GAME_ID, botFillAfterSeconds: 1, sweepTickMs: 25 });
    const paired: PairedGroupMessage[][] = [[], [], []];
    for (const [index, playerId] of HUMANS.entries()) {
      const token = await issuer.mint({ tenantId: TENANT_ID, playerId, entitlements: [GROUP_GAME_ID] }, 60);
      const client = await testServer.connectTo(presenceRoom, { gameId: GROUP_GAME_ID, modality: { roundLength: 15 }, playerId, token });
      client.onMessage("paired", (message: PairedGroupMessage) => paired[index]!.push(message));
    }

    // The window above plus room for a 25ms tick to land after it.
    await new Promise((resolve) => setTimeout(resolve, 1400));

    // The 'paired' roster is the k humans in formation order — the bots get
    // their identities inside MatchRoom; they are never part of the lobby's
    // shared fact.
    for (const messages of paired) {
      expect(messages).toHaveLength(1);
      expect(messages[0]!.players).toEqual([...HUMANS]);
    }

    const started = await consumeAndAwaitStart(paired.map((messages) => messages[0]!.matchReservation));
    // Exactly the 3 humans hold seats, plus ONE identity that is none of
    // them: the bot MatchRoom minted for the last seat.
    const humanSet = new Set<string>(HUMANS);
    expect(started.players.filter((playerId) => humanSet.has(playerId))).toHaveLength(3);
    expect(started.players.filter((playerId) => !humanSet.has(playerId))).toHaveLength(1);
  }, LIVE_TEST_TIMEOUT_MS);

  it("rescues a LONE waiter past the timeout in a 4-seat modality: paired alone, match starts as 1 human + 3 bots (the arity-1 pool claim)", async () => {
    const presenceRoom = await testServer.createRoom("presence", { gameId: GROUP_GAME_ID, botFillAfterSeconds: 0.05, sweepTickMs: 25 });
    const token = await issuer.mint({ tenantId: TENANT_ID, playerId: HUMANS[0]!, entitlements: [GROUP_GAME_ID] }, 60);
    const client = await testServer.connectTo(presenceRoom, { gameId: GROUP_GAME_ID, modality: { roundLength: 15 }, playerId: HUMANS[0], token });
    const paired: PairedGroupMessage[] = [];
    client.onMessage("paired", (message: PairedGroupMessage) => paired.push(message));

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(paired).toHaveLength(1);
    expect(paired[0]!.players).toEqual([HUMANS[0]]);

    const started = await consumeAndAwaitStart([paired[0]!.matchReservation]);
    expect(started.players).toContain(HUMANS[0]);
    expect(started.players.filter((playerId) => playerId !== HUMANS[0])).toHaveLength(3);
  }, LIVE_TEST_TIMEOUT_MS);

  /** GREEN-FROM-BIRTH PIN (disclosed as such): 1v1 has never degraded — this
   * pins the strict `seatCount > 2` guard so it can never START degrading. A
   * generous wait, many ticks past the tiny threshold, and the lone 2-seat
   * waiter is still waiting, still counted, never bot-filled (the client-side
   * bot CTA is that queue's rescue, not a server-side pop). */
  it("never degrades a 2-seat queue: a lone 1v1 waiter far past the timeout is not paired and stays counted as waiting", async () => {
    const presenceRoom = await testServer.createRoom("presence", { gameId: DUO_GAME_ID, botFillAfterSeconds: 0.05, sweepTickMs: 25 });
    // THE COUNTER IS READ THROUGH A WATCHER, which is how the widget reads it:
    // `joinMatchmakingQueue` subscribes to `paired` and `pairing-failed` and
    // to nothing else, so a queued client is not a channel this number ever
    // travelled on outside these fences.
    const counter = await testServer.connectTo(presenceRoom, { gameId: DUO_GAME_ID });
    const counts: Array<Array<{ modality: { roundLength: number }; waitingCount: number }>> = [];
    counter.onMessage("counts", (message) => counts.push(message));
    const client = await testServer.connectTo(presenceRoom, { gameId: DUO_GAME_ID, modality: { roundLength: 15 }, playerId: "duo-lone" });
    const paired: unknown[] = [];
    client.onMessage("paired", (message) => paired.push(message));

    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(paired).toHaveLength(0);
    const lastCounts = counts[counts.length - 1]!;
    expect(lastCounts.find((entry) => entry.modality.roundLength === 15)?.waitingCount).toBe(1);
  }, LIVE_TEST_TIMEOUT_MS);

  /** GREEN-FROM-BIRTH PIN (disclosed as such): the other edge of the knob —
   * waiters YOUNGER than `botFillAfterSeconds` are never popped, however many
   * sweep ticks have run. */
  it("never degrades prematurely: 4-seat waiters younger than the threshold stay queued through many ticks", async () => {
    const presenceRoom = await testServer.createRoom("presence", { gameId: GROUP_GAME_ID, botFillAfterSeconds: 5, sweepTickMs: 25 });
    const paired: unknown[][] = [[], []];
    const counts: Array<Array<{ modality: { roundLength: number }; waitingCount: number }>> = [];
    const counter = await testServer.connectTo(presenceRoom, { gameId: GROUP_GAME_ID });
    counter.onMessage("counts", (message) => counts.push(message));
    for (const [index, playerId] of HUMANS.slice(0, 2).entries()) {
      const client = await testServer.connectTo(presenceRoom, { gameId: GROUP_GAME_ID, modality: { roundLength: 15 }, playerId });
      client.onMessage("paired", (message) => paired[index]!.push(message));
    }

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(paired.flat()).toHaveLength(0);
    const lastCounts = counts[counts.length - 1]!;
    expect(lastCounts.find((entry) => entry.modality.roundLength === 15)?.waitingCount).toBe(2);
  }, LIVE_TEST_TIMEOUT_MS);
});
