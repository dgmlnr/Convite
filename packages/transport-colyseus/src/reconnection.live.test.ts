import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ColyseusTestServer } from "@colyseus/testing";
import type { GameModule, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import { createGameModuleRegistry, createJtiReplayGuard, createRateLimiter, createSessionTokenIssuer, createStaticTenantRepository } from "@hexdev/platform-core";
import type { TenantId } from "@hexdev/platform-core";
import { createMatchServer } from "./server.js";

/**
 * Deliberately non-truco, same boundary reasoning as `single-player.live.test.ts`:
 * `transport-colyseus` may not depend on any real game package. `demand`/
 * `respond` stands in for "a pending truco/envido call" (spec 6.4) without
 * `MatchRoom` ever needing to know what a real call looks like.
 */
interface ReconnectState {
  readonly players: readonly [PlayerId, PlayerId];
  readonly turnSeat: 0 | 1;
  readonly pendingOn: 0 | 1 | null;
  readonly resolved: boolean;
}
type ReconnectAction =
  | { readonly type: "demand"; readonly playerId: PlayerId }
  | { readonly type: "respond"; readonly playerId: PlayerId; readonly answer: "accept" | "decline" }
  | { readonly type: "advance"; readonly playerId: PlayerId };

const reconnectModule: GameModule<ReconnectState, ReconnectAction, ReconnectState, void> = {
  id: "fixture-reconnect",
  metadata: { seatCount: 2, displayNameKey: "fixture.reconnect", assetBase: "/fixture" },
  configOptions: [],
  createMatch: (_config, seats: readonly SeatAssignment[]) => {
    const sorted = [...seats].sort((a, b) => a.seat - b.seat);
    return { players: [sorted[0]!.playerId, sorted[1]!.playerId], turnSeat: 0, pendingOn: null, resolved: false };
  },
  applyAction: (state, action) => {
    if (action.type === "demand") {
      const otherSeat = state.players.indexOf(action.playerId) === 0 ? 1 : 0;
      return { ok: true, state: { ...state, pendingOn: otherSeat as 0 | 1 } };
    }
    if (action.type === "respond") {
      return { ok: true, state: { ...state, pendingOn: null, resolved: true, turnSeat: state.turnSeat === 0 ? 1 : 0 } };
    }
    return { ok: true, state: { ...state, turnSeat: state.turnSeat === 0 ? 1 : 0 } };
  },
  getLegalActions: (state, playerId) => {
    const seat = state.players.indexOf(playerId);
    if (state.pendingOn !== null) return state.pendingOn === seat ? [{ type: "respond", playerId, answer: "accept" }, { type: "respond", playerId, answer: "decline" }] : [];
    return seat === state.turnSeat ? [{ type: "demand", playerId }, { type: "advance", playerId }] : [];
  },
  getViewFor: (state) => state,
  getOutcome: () => null,
  serialize: (state) => state as never,
  deserialize: (json) => json as unknown as ReconnectState,
  createBot: () => ({ chooseAction: async (_view, legal) => legal[0]! }),
};

const TENANT_ID = "tenant-reconnect" as TenantId;
const ALLOWED_ORIGIN = "https://tenant.example";
const P0 = "reconnect-seat-0" as PlayerId;
const P1 = "reconnect-seat-1" as PlayerId;

async function waitFor(views: readonly ReconnectState[], matches: (view: ReconnectState) => boolean, timeoutMs = 3000): Promise<ReconnectState> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = views.find(matches);
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for the expected view");
}

describe("MatchRoom — disconnect, reconnection window, and bot takeover over a real WebSocket (spec: 'Disconnect, Reconnection Window, and Bot Takeover')", () => {
  let testServer: ColyseusTestServer;
  let issuer: ReturnType<typeof createSessionTokenIssuer>;
  // See `server.live.test.ts`: `boot()` silently ignores `port`. Own range.
  let nextPort = 2700;

  beforeEach(async () => {
    issuer = createSessionTokenIssuer("reconnect-live-secret");
    const repository = createStaticTenantRepository([{ id: TENANT_ID, embedKey: "pk_reconnect", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: ["fixture-reconnect"] }]);
    const registry = createGameModuleRegistry([reconnectModule]);
    const httpServer = createServer();
    const auth = {
      issuer,
      repository,
      replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }),
      joinRateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
    };
    const gameServer = createMatchServer({ httpServer, registry, auth, rng: () => 0.5 });
    await gameServer.listen(nextPort++);
    testServer = new ColyseusTestServer(gameServer);
    testServer.sdk.http.options.headers = { origin: ALLOWED_ORIGIN };
  });

  afterEach(async () => {
    await testServer.shutdown();
  });

  it("a real client reconnects within the window and resumes its seat, receiving the current view again", async () => {
    const room = await testServer.createRoom("match", { gameId: "fixture-reconnect", config: undefined, reconnectionWindowSeconds: 5 });
    const token0 = await issuer.mint({ tenantId: TENANT_ID, playerId: P0, entitlements: ["fixture-reconnect"] }, 60);
    const token1 = await issuer.mint({ tenantId: TENANT_ID, playerId: P1, entitlements: ["fixture-reconnect"] }, 60);
    const client0 = await testServer.connectTo(room, { token: token0 });
    await testServer.connectTo(room, { token: token1 });
    const reconnectionToken = client0.reconnectionToken;

    client0.leave(false); // abrupt drop, NOT a consented leave
    await new Promise((resolve) => setTimeout(resolve, 50));

    const reconnected = await testServer.sdk.reconnect(reconnectionToken);
    const views: ReconnectState[] = [];
    reconnected.onMessage("view", (view) => views.push(view));
    await waitFor(views, () => true); // onReconnect resends the current view unprompted
    expect(views[0]).toMatchObject({ turnSeat: 0 });

    // Still a HUMAN-controlled seat, not a bot: this player's own action is
    // what advances the match, proving the seat was genuinely resumed.
    reconnected.send("action", { type: "advance", playerId: P0 });
    await waitFor(views, (view) => view.turnSeat === 1);
  });

  it("window expires without reconnection: a bot takes over the seat AND resolves a decision demanded of it (spec 6.4)", async () => {
    const room = await testServer.createRoom("match", { gameId: "fixture-reconnect", config: undefined, reconnectionWindowSeconds: 0.2 });
    const token0 = await issuer.mint({ tenantId: TENANT_ID, playerId: P0, entitlements: ["fixture-reconnect"] }, 60);
    const token1 = await issuer.mint({ tenantId: TENANT_ID, playerId: P1, entitlements: ["fixture-reconnect"] }, 60);
    const client0 = await testServer.connectTo(room, { token: token0 });
    const client1 = await testServer.connectTo(room, { token: token1 });
    const views1: ReconnectState[] = [];
    client1.onMessage("view", (view) => views1.push(view));

    client0.leave(false); // seat 0 drops abruptly
    await new Promise((resolve) => setTimeout(resolve, 400)); // past the 0.2s window: takeover fires

    // The remaining human demands a decision FROM the now-bot-controlled
    // seat — exactly "a call pending the disconnected player's response".
    client1.send("action", { type: "demand", playerId: P1 });
    const resolved = await waitFor(views1, (view) => view.resolved);
    expect(resolved.pendingOn).toBeNull(); // the takeover bot answered it, unprompted
  });
});
