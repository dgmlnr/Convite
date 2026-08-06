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
import { PresenceRoom, createMatchServer } from "@hexdev/transport-colyseus";
import { createTransportClient } from "./client.js";
import { joinMatchFromReservation, startBotMatch } from "./match-connection.js";
import { joinMatchmakingQueue, watchPresence } from "./presence-connection.js";

/**
 * THE strongest proof this package's production code (not a fake, not the
 * bare `@colyseus/sdk`, real `createTransportClient` over a real WebSocket
 * port) genuinely talks to the real server rooms it is built against — the
 * same live-WebSocket discipline `presence-room.live.test.ts` established
 * ("a pairing mechanism proven only against fakes is weak evidence"),
 * applied here to the CLIENT side of the exact same hand-off.
 */
interface FixtureState {
  readonly players: readonly PlayerId[];
  readonly moves: number;
}
type FixtureAction = { readonly type: "move"; readonly playerId: PlayerId };
const GAME_ID = "fixture-adapter" as GameId;

const fixtureModule: GameModule<FixtureState, FixtureAction, FixtureState, unknown> = {
  id: GAME_ID,
  metadata: { seatCount: 2, displayNameKey: "fixture.adapter", assetBase: "/fixture" },
  configOptions: [{ key: "roundLength", labelKey: "fixture.roundLength", values: [15, 30], defaultValue: 15 }],
  createMatch: (_config, seats: readonly SeatAssignment[]) => ({ players: [...seats].sort((a, b) => a.seat - b.seat).map((s) => s.playerId), moves: 0 }),
  applyAction: (state) => ({ ok: true, state: { ...state, moves: state.moves + 1 } }),
  // Alternates by parity of `moves` so BOTH seats get real turns — the bot
  // match test below relies on this to prove the bot seat genuinely acts on
  // its own turn (MatchRoom's advance() loop), not merely that it exists.
  getLegalActions: (state, playerId) => (state.players[state.moves % 2] === playerId ? [{ type: "move", playerId }] : []),
  getViewFor: (state) => state,
  getOutcome: () => null,
  serialize: (state) => state as never,
  deserialize: (json) => json as unknown as FixtureState,
  createBot: () => ({ chooseAction: async (_view, legal) => legal[0]! }),
};

describe("transport-colyseus-client — real production code over a real WebSocket, against real MatchRoom/PresenceRoom", () => {
  const TENANT_ID = "tenant-adapter" as TenantId;
  const ALLOWED_ORIGIN = "https://adapter.example";
  const P0 = "adapter-p0" as PlayerId;
  const P1 = "adapter-p1" as PlayerId;

  let testServer: ColyseusTestServer;
  let issuer: SessionTokenIssuer;
  let port: number;
  let httpServer: ReturnType<typeof createServer>;

  beforeEach(async () => {
    port = 2700 + Math.floor(Math.random() * 500);
    const registry = createGameModuleRegistry([fixtureModule]);
    const pool = createMatchmakingPool();
    httpServer = createServer();
    issuer = createSessionTokenIssuer("adapter-live-secret");
    const repository = createStaticTenantRepository([
      { id: TENANT_ID, embedKey: "pk_adapter", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: [GAME_ID] },
    ]);
    const auth = {
      issuer,
      repository,
      replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }),
      joinRateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
    };
    const gameServer = createMatchServer({ httpServer, registry, auth, rng: () => 0.5 });
    gameServer.define("presence", PresenceRoom, { registry, pool } as never);
    await gameServer.listen(port);
    testServer = new ColyseusTestServer(gameServer);
    testServer.sdk.http.options.headers = { origin: ALLOWED_ORIGIN };
  });

  afterEach(async () => {
    await testServer.shutdown();
  });

  it("watches presence, queues, gets paired, and joins the real MatchRoom via this package's own client — a real action is applied", async () => {
    const token0 = await issuer.mint({ tenantId: TENANT_ID, playerId: P0, entitlements: [GAME_ID] }, 60);
    const token1 = await issuer.mint({ tenantId: TENANT_ID, playerId: P1, entitlements: [GAME_ID] }, 60);

    const watcherClient = createTransportClient(`ws://localhost:${port}`, { headers: { origin: ALLOWED_ORIGIN } });
    const watcher = await watchPresence(watcherClient, { gameId: GAME_ID, playerId: "watcher" });
    const seenCounts: unknown[] = [];
    watcher.onCounts((display) => seenCounts.push(display));

    const client0 = createTransportClient(`ws://localhost:${port}`, { headers: { origin: ALLOWED_ORIGIN } });
    const client1 = createTransportClient(`ws://localhost:${port}`, { headers: { origin: ALLOWED_ORIGIN } });
    const queue0 = await joinMatchmakingQueue(client0, { gameId: GAME_ID, playerId: P0, modality: { roundLength: 15 }, token: token0 });
    const paired0: Array<{ opponentPlayerId: PlayerId; reservation: unknown }> = [];
    queue0.onPaired((pairing) => paired0.push(pairing));
    const queue1 = await joinMatchmakingQueue(client1, { gameId: GAME_ID, playerId: P1, modality: { roundLength: 15 }, token: token1 });
    const paired1: Array<{ opponentPlayerId: PlayerId; reservation: unknown }> = [];
    queue1.onPaired((pairing) => paired1.push(pairing));

    await new Promise((resolve) => setTimeout(resolve, 150));

    // The watch-only connection saw the queue fill via live broadcasts, and
    // never appears in either pairing (it was never enqueued).
    expect(seenCounts.length).toBeGreaterThan(0);
    expect(paired0[0]?.opponentPlayerId).toBe(P1);
    expect(paired1[0]?.opponentPlayerId).toBe(P0);

    const match0 = await joinMatchFromReservation<FixtureState>(client0, paired0[0]!.reservation);
    const views0: FixtureState[] = [];
    match0.onView((view) => views0.push(view));
    const match1 = await joinMatchFromReservation<FixtureState>(client1, paired1[0]!.reservation);
    expect(match0.roomId).toBe(match1.roomId); // same real MatchRoom for both, via this package's own join call

    match0.sendAction({ type: "move", playerId: P0 });
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !views0.some((v) => v.moves === 1)) await new Promise((r) => setTimeout(r, 20));
    expect(views0.some((view) => view.moves === 1)).toBe(true);

    await watcher.leave();
    await match0.leave();
    await match1.leave();
  });

  it("starts a fresh bot match with no lobby wait — this package's own startBotMatch, a real second seat filled by a bot controller", async () => {
    const token = await issuer.mint({ tenantId: TENANT_ID, playerId: P0, entitlements: [GAME_ID] }, 60);
    const client = createTransportClient(`ws://localhost:${port}`, { headers: { origin: ALLOWED_ORIGIN } });

    const match = await startBotMatch<FixtureState>(client, { gameId: GAME_ID, config: { roundLength: 15 }, botTier: "easy", playerId: P0, token });
    const views: FixtureState[] = [];
    match.onView((view) => views.push(view));

    match.sendAction({ type: "move", playerId: P0 });
    const deadline = Date.now() + 3000;
    // Two real moves expected: the human's own submitted move (moves: 0->1),
    // THEN the bot's own turn advancing automatically with zero human input
    // (MatchRoom.advance()'s loop, fixtureModule's alternating legality) —
    // proving the room really only needed ONE human seat to start AND that
    // the bot seat genuinely acts on its own, not just that it exists.
    while (Date.now() < deadline && !views.some((v) => v.moves >= 2)) await new Promise((r) => setTimeout(r, 20));
    expect(views.some((view) => view.moves >= 2)).toBe(true);

    await match.leave();
  });
});
