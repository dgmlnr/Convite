import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import type { GameModule, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import { createGameModuleRegistry, createJtiReplayGuard, createRateLimiter, createSessionTokenIssuer, createStaticTenantRepository } from "@hexdev/platform-core";
import type { TenantId } from "@hexdev/platform-core";
import { createMatchServer } from "./server.js";

/**
 * The first live-socket proof in the project (obs 2941/2942: blocked until
 * `@colyseus/testing` was installed this session). Deliberately non-truco,
 * same reasoning as `match-room.test.ts`'s fixture: this proves the
 * COMPOSITION ROOT wiring over a REAL WebSocket with REAL minted tokens —
 * truco-module's deal factory is already unit-proven in `deal.test.ts`.
 */
interface LiveState {
  readonly players: readonly [PlayerId, PlayerId];
  readonly dealt: boolean;
  readonly moves: number;
}
type LiveAction = { readonly type: "deal"; readonly playerId: PlayerId } | { readonly type: "move"; readonly playerId: PlayerId };
const SYSTEM_ACTOR = "system-actor" as PlayerId;

const liveModule: GameModule<LiveState, LiveAction, LiveState, void> = {
  id: "fixture-live",
  metadata: { seatCount: 2, displayNameKey: "fixture.live", assetBase: "/fixture" },
  configOptions: [],
  createMatch: (_config, seats: readonly SeatAssignment[]) => {
    const sorted = [...seats].sort((a, b) => a.seat - b.seat);
    return { players: [sorted[0]!.playerId, sorted[1]!.playerId], dealt: false, moves: 0 };
  },
  applyAction: (state, action) => {
    if (action.type === "deal") return { ok: true, state: { ...state, dealt: true } };
    if (!state.dealt) return { ok: false, violation: { code: "not-dealt", message: "wait for the deal" } };
    return { ok: true, state: { ...state, moves: state.moves + 1 } };
  },
  getLegalActions: (state, playerId) => (state.dealt && state.players[0] === playerId ? [{ type: "move", playerId }] : []),
  getViewFor: (state) => state,
  getOutcome: () => null,
  serialize: (state) => state as never,
  deserialize: (json) => json as unknown as LiveState,
  createBot: () => ({ chooseAction: async (_view, legal) => legal[0]! }),
};

const TENANT_ID = "tenant-live" as TenantId;
const ALLOWED_ORIGIN = "https://tenant.example";
const P0 = "live-seat-0" as PlayerId;
const P1 = "live-seat-1" as PlayerId;

/** A PERSISTENT collector, not `waitForMessage` (only sees the NEXT
 * occurrence): the second client's join synchronously triggers two
 * broadcasts in a row, so a one-shot wait is racy. A collector registered on
 * an ALREADY-JOINED client cannot miss anything: no broadcast is possible
 * before both seats exist. */
function collectViews(client: { onMessage(type: string, callback: (message: LiveState) => void): void }): LiveState[] {
  const views: LiveState[] = [];
  client.onMessage("view", (view) => views.push(view));
  return views;
}

async function waitFor(views: readonly LiveState[], matches: (view: LiveState) => boolean, timeoutMs = 3000): Promise<LiveState> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = views.find(matches);
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for the expected view");
}

describe("createMatchServer — live WebSocket integration (the composition root's own runtime proof)", () => {
  let testServer: ColyseusTestServer;

  beforeEach(async () => {
    const issuer = createSessionTokenIssuer("live-test-secret");
    const repository = createStaticTenantRepository([
      { id: TENANT_ID, embedKey: "pk_live", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: ["fixture-live"] },
    ]);
    const registry = createGameModuleRegistry([{ module: liveModule, requestSystemAction: (state) => ((state as LiveState).dealt ? null : { type: "deal", playerId: SYSTEM_ACTOR }) }]);
    const httpServer = createServer();
    const auth = {
      issuer,
      repository,
      replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }), // matches this fixture's mint() ttlSeconds
      joinRateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
    };
    const gameServer = createMatchServer({ httpServer, registry, auth, rng: () => 0.5 });
    testServer = await boot(gameServer);
  });

  afterEach(async () => {
    await testServer.shutdown();
  });

  it("two real clients join over a real websocket with real minted tokens, the match deals automatically, and a submitted action is applied", async () => {
    const issuer = createSessionTokenIssuer("live-test-secret");
    // The SDK's Node client sends no `Origin` header by default — set it so
    // this exercises the REAL origin-allowlist gate (spec: "Server-Side
    // Origin Allowlist Enforcement"), not a client that bypasses it.
    testServer.sdk.http.options.headers = { origin: ALLOWED_ORIGIN };
    const room = await testServer.createRoom("match", { gameId: "fixture-live", config: undefined });
    const token0 = await issuer.mint({ tenantId: TENANT_ID, playerId: P0, entitlements: ["fixture-live"] }, 60);
    const token1 = await issuer.mint({ tenantId: TENANT_ID, playerId: P1, entitlements: ["fixture-live"] }, 60);
    // client0 joins ALONE first (one seat: no broadcast possible yet), so
    // its collector is registered race-free before client1's join triggers both broadcasts.
    const client0 = await testServer.connectTo(room, { token: token0 });
    const views0 = collectViews(client0);
    const client1 = await testServer.connectTo(room, { token: token1 });

    const dealt0 = await waitFor(views0, (view) => view.dealt);
    expect(dealt0.dealt).toBe(true);

    client0.send("action", { type: "move", playerId: P0 });
    const moved = await waitFor(views0, (view) => view.moves === 1);
    expect(moved.moves).toBe(1);
    client1.leave();
  });

  it("rejects a real client connecting over a real websocket with no token", async () => {
    const room = await testServer.createRoom("match", { gameId: "fixture-live", config: undefined });
    await expect(testServer.connectTo(room, {})).rejects.toBeDefined();
  });
});
