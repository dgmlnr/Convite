import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ColyseusTestServer } from "@colyseus/testing";
import type { GameModule, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import { createGameModuleRegistry, createJtiReplayGuard, createRateLimiter, createSessionTokenIssuer, createStaticTenantRepository } from "@hexdev/platform-core";
import type { TenantId } from "@hexdev/platform-core";
import { createMatchServer } from "./server.js";

/**
 * Deliberately non-truco (same reasoning as every other live-socket fixture
 * in this file's siblings): `transport-colyseus` must never import a real
 * game (design §5, `l2-no-l2` sibling boundary — `truco-module` is a sibling
 * L2 package, not a dependency this package may take, even from a test).
 * `truco-argentino`'s own real single-player behavior is proven at the
 * `truco-module`/`truco-bot` layer (conformance suite + `tournament.test.ts`,
 * obs 2927); this proves the TRANSPORT mechanism only — real single-player
 * play, autonomously, with ONE real client and no second one ever joining.
 */
interface SoloState {
  readonly players: readonly [PlayerId, PlayerId];
  readonly turnSeat: 0 | 1;
  readonly movesLeft: number;
}
type SoloAction = { readonly type: "advance"; readonly playerId: PlayerId };

const soloModule: GameModule<SoloState, SoloAction, SoloState, void> = {
  id: "fixture-solo",
  metadata: { seatCount: 2, displayNameKey: "fixture.solo", assetBase: "/fixture" },
  configOptions: [],
  createMatch: (_config, seats: readonly SeatAssignment[]) => {
    const sorted = [...seats].sort((a, b) => a.seat - b.seat);
    return { players: [sorted[0]!.playerId, sorted[1]!.playerId], turnSeat: 0, movesLeft: 4 };
  },
  applyAction: (state) =>
    state.movesLeft <= 0
      ? { ok: false, violation: { code: "match-over", message: "the match already ended" } }
      : { ok: true, state: { ...state, turnSeat: state.turnSeat === 0 ? 1 : 0, movesLeft: state.movesLeft - 1 } },
  getLegalActions: (state, playerId) =>
    state.movesLeft > 0 && state.players.indexOf(playerId) === state.turnSeat ? [{ type: "advance", playerId }] : [],
  getViewFor: (state) => state,
  getOutcome: (state) => (state.movesLeft <= 0 ? { winnerIds: [state.players[0]!] } : null),
  serialize: (state) => state as never,
  deserialize: (json) => json as unknown as SoloState,
  createBot: () => ({ chooseAction: async (_view, legal) => legal[0]! }),
};

const TENANT_ID = "tenant-solo" as TenantId;
const ALLOWED_ORIGIN = "https://tenant.example";
const P0 = "solo-seat-0" as PlayerId;

async function waitFor(views: readonly SoloState[], matches: (view: SoloState) => boolean, timeoutMs = 3000): Promise<SoloState> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = views.find(matches);
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for the expected view");
}

describe("MatchRoom — single-player vs bot over a real WebSocket (spec: Single-Player vs Bot Mode)", () => {
  let testServer: ColyseusTestServer;
  // See `server.live.test.ts`: `boot()` silently ignores `port` for a raw
  // `Server` instance. Own distinct port range, same workaround.
  let nextPort = 2680;

  beforeEach(async () => {
    const issuer = createSessionTokenIssuer("solo-live-secret");
    const repository = createStaticTenantRepository([{ id: TENANT_ID, embedKey: "pk_solo", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: ["fixture-solo"] }]);
    const registry = createGameModuleRegistry([soloModule]);
    const httpServer = createServer();
    const auth = {
      issuer,
      repository,
      replayGuard: createJtiReplayGuard({ ttlMs: 60_000 }),
      joinRateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
      allowedWidgetOrigins: [ALLOWED_ORIGIN],
    };
    const gameServer = createMatchServer({ httpServer, registry, auth, rng: () => 0.5 });
    await gameServer.listen(nextPort++);
    testServer = new ColyseusTestServer(gameServer);
    testServer.sdk.http.options.headers = { origin: ALLOWED_ORIGIN };
  });

  afterEach(async () => {
    await testServer.shutdown();
  });

  it("plays a full match to its outcome with exactly ONE real client and a bot occupying the other seat", async () => {
    const issuer = createSessionTokenIssuer("solo-live-secret");
    const room = await testServer.createRoom("match", { gameId: "fixture-solo", config: undefined, botTier: "hard" });
    const token0 = await issuer.mint({ tenantId: TENANT_ID, playerId: P0, entitlements: ["fixture-solo"] }, 60);
    const client0 = await testServer.connectTo(room, { token: token0 });
    const views: SoloState[] = [];
    client0.onMessage("view", (message: { view: SoloState }) => views.push(message.view));

    // Plays a full match to its outcome: the human submits ONLY its own two
    // turns (movesLeft 4 -> 3, then 2 -> 1); the bot answers automatically
    // in between (3 -> 2) and closes the match alone (1 -> 0) — no client
    // ever occupies seat 1.
    client0.send("action", { type: "advance", playerId: P0 });
    await waitFor(views, (view) => view.turnSeat === 0 && view.movesLeft === 2);
    client0.send("action", { type: "advance", playerId: P0 });

    const outcome = await waitFor(views, (view) => view.movesLeft === 0);
    expect(outcome.movesLeft).toBe(0);
    // No second client EVER connected — a second seat filled entirely by
    // the bot `createBot("hard")` created at room creation.
  });
});
