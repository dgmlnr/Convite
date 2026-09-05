import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { ColyseusTestServer } from "@colyseus/testing";
import type { GameModule, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import {
  createGameModuleRegistry,
  createJtiReplayGuard,
  createRateLimiter,
  createSessionTokenIssuer,
  createSessionTokenVerifier,
  createStaticTenantRepository,
  deriveTestSessionSigningKey,
} from "@hexdev/platform-core";
import type { TenantId } from "@hexdev/platform-core";
import { createMatchServer } from "./server.js";
import { LIVE_TEST_TIMEOUT_MS, waitForView } from "./live-wait.test-support.js";

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
function collectViews(client: { onMessage(type: string, callback: (message: { view: LiveState }) => void): void }): LiveState[] {
  const views: LiveState[] = [];
  client.onMessage("view", (message) => views.push(message.view));
  return views;
}

const describeLive = (view: LiveState): string => `dealt=${String(view.dealt)} moves=${String(view.moves)}`;

describe("createMatchServer — live WebSocket integration (the composition root's own runtime proof)", () => {
  let testServer: ColyseusTestServer;
  // `boot()` SILENTLY IGNORES its `port` argument when given a `Server`
  // instance directly — it always calls `gameServer.listen(2568)` internally
  // (verified reading @colyseus/testing's own source, not assumed). Reusing
  // that one fixed port across this file's two sequential tests, and now
  // ALSO against `presence-room.live.test.ts` running in the same suite,
  // caused a real EADDRINUSE found running `pnpm test` from clean. Fix:
  // listen on our OWN chosen port first, then wrap directly — bypassing
  // `boot()`'s buggy re-listen for this call shape entirely.
  //
  // Disjoint 100-wide band (stable window height apply prompt, round 3) —
  // see `adapter.live.test.ts`'s own doc comment for the full band map
  // across every `*.live.test.ts` file's own port pool.
  let nextPort = 3400;

  beforeEach(async () => {
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("live-test-secret"));
    // `validUntil` far in the future (tenant-administration slice 6): a real
    // join now enforces the validity window (`MatchRoom.onAuth`).
    const repository = createStaticTenantRepository([
      { id: TENANT_ID, embedKey: "pk_live", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: ["fixture-live"], validUntil: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 },
    ]);
    const registry = createGameModuleRegistry([{ module: liveModule, requestSystemAction: (state) => ((state as LiveState).dealt ? null : { type: "deal", playerId: SYSTEM_ACTOR }) }]);
    const httpServer = createServer();
    const auth = {
      verifier: await createSessionTokenVerifier(issuer.publicKey),
      repository,
      replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }), // matches this fixture's mint() ttlSeconds
      joinRateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
      allowedWidgetOrigins: [ALLOWED_ORIGIN],
    };
    const gameServer = createMatchServer({ httpServer, registry, auth, rng: () => 0.5 });
    await gameServer.listen(nextPort++);
    testServer = new ColyseusTestServer(gameServer);
  });

  afterEach(async () => {
    await testServer.shutdown();
  });

  it("two real clients join over a real websocket with real minted tokens, the match deals automatically, and a submitted action is applied", async () => {
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("live-test-secret"));
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

    const dealt0 = await waitForView({ views: views0, matches: (view) => view.dealt, what: "the deal to reach seat 0", describe: describeLive });
    expect(dealt0.dealt).toBe(true);

    client0.send("action", { type: "move", playerId: P0 });
    const moved = await waitForView({ views: views0, matches: (view) => view.moves === 1, what: "seat 0 to see the first move", describe: describeLive });
    expect(moved.moves).toBe(1);
    client1.leave();
  }, LIVE_TEST_TIMEOUT_MS);

  it("rejects a real client connecting over a real websocket with no token", async () => {
    const room = await testServer.createRoom("match", { gameId: "fixture-live", config: undefined });
    await expect(testServer.connectTo(room, {})).rejects.toBeDefined();
  }, LIVE_TEST_TIMEOUT_MS);
});

/**
 * THE REAL BUG this unit found running a genuine browser join (not
 * assumed): a composition root sharing its own `http.Server` with colyseus
 * (design's own documented pattern, `createMatchServer`'s docstring) needs a
 * way to add custom routes (`/embed`, `/loader.js`) WITHOUT racing colyseus's
 * own matchmake routes for the same request — two separate plain
 * `server.on("request", ...)` listeners on one socket both try to respond,
 * and whichever finishes second crashes with `ERR_HTTP_HEADERS_SENT`. Real
 * @colyseus/core supports exactly this via `Server`'s own `express` option
 * (verified in its installed `.d.ts`'s own documented example) — this
 * threads it through `createMatchServer` instead of reinventing a second
 * request-routing mechanism.
 */
describe("createMatchServer — the express option (custom routes coexisting with colyseus's own matchmake routes on ONE shared server)", () => {
  let httpServer: ReturnType<typeof createServer>;
  let gameServer: Awaited<ReturnType<typeof createMatchServer>>;
  let port: number;

  afterEach(async () => {
    await gameServer.gracefullyShutdown(false);
  });

  it("a custom route added via express responds, AND colyseus's own real HTTP matchmake route still works on the same server", async () => {
    // Disjoint 100-wide random band — see `adapter.live.test.ts`'s own doc
    // comment for the full band map (stable window height apply prompt,
    // round 3: this used to overlap `adapter.live.test.ts`'s own [2700,3199]
    // random range).
    port = 3500 + Math.floor(Math.random() * 100);
    const registry = createGameModuleRegistry([liveModule]);
    const unusedIssuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("express-option-secret"));
    const auth = {
      verifier: await createSessionTokenVerifier(unusedIssuer.publicKey),
      repository: createStaticTenantRepository([]),
      replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }),
      joinRateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
      allowedWidgetOrigins: [],
    };
    httpServer = createServer();
    gameServer = createMatchServer({
      httpServer,
      registry,
      auth,
      rng: () => 0.5,
      express: (app) => {
        app.get("/custom-route", (_req: Request, res: Response) => res.json({ ok: true }));
      },
    });
    await gameServer.listen(port);

    const customResponse = await fetch(`http://localhost:${port}/custom-route`);
    expect(customResponse.status).toBe(200);
    expect(await customResponse.json()).toEqual({ ok: true });

    // A REAL HTTP request, not @colyseus/testing's own SDK-shortcut
    // connectTo — the exact request shape a real browser's
    // joinOrCreate/create performs before upgrading to a WebSocket.
    const matchmakeResponse = await fetch(`http://localhost:${port}/matchmake/joinOrCreate/match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameId: "fixture-live", config: undefined }),
    });
    const responseText = await matchmakeResponse.text();
    expect(matchmakeResponse.status, responseText).toBe(200);
    const body = JSON.parse(responseText) as { roomId?: string };
    expect(body.roomId).toBeDefined();
  }, LIVE_TEST_TIMEOUT_MS);
});
