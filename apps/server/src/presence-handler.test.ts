import { describe, expect, it } from "vitest";
import { createGameModuleRegistry, createMatchmakingPool, createRateLimiter, GLOBAL_POOL_KEY } from "@hexdev/platform-core";
import type { LobbyDisplayEntry } from "@hexdev/platform-core";
import type { GameId, GameModule, PlayerId } from "@hexdev/platform-contract";
import { handlePresenceRequest } from "./presence-handler.js";

const TRUCO_ID = "truco-argentino" as GameId;

function fakeModule(): GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> {
  return {
    id: TRUCO_ID,
    metadata: { seatCount: 2, displayNameKey: "games.truco.name", assetBase: "/games/truco-argentino" },
    configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
    createMatch: () => ({}),
    applyAction: () => ({ ok: true, state: {} }),
    getLegalActions: () => [],
    getViewFor: () => ({}),
    getOutcome: () => null,
    serialize: () => null,
    deserialize: () => ({}),
    createBot: () => ({ chooseAction: () => ({ playerId: "bot" as PlayerId }) }),
  };
}

function deps(overrides: { ipLimit?: number } = {}) {
  const registry = createGameModuleRegistry([fakeModule()]);
  const pool = createMatchmakingPool();
  return {
    registry,
    pool,
    poolKey: GLOBAL_POOL_KEY,
    ipLimiter: createRateLimiter({ limit: overrides.ipLimit ?? 1000, windowMs: 60_000 }),
  };
}

describe("handlePresenceRequest (spec: game-session — lobby presence counters, zero-counter UX rule)", () => {
  it("returns the derived lobby display for a known, registered game", () => {
    const url = new URL(`https://play.hexdev/presence?gameId=${TRUCO_ID}`);
    const result = handlePresenceRequest(url, "203.0.113.1", deps());
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as readonly LobbyDisplayEntry[];
    expect(body).toEqual([
      { modality: { pointsToWin: 15 }, waitingCount: undefined, promoteBotFallback: true },
      { modality: { pointsToWin: 30 }, waitingCount: undefined, promoteBotFallback: true },
    ]);
  });

  it("reflects a waiting player once one joins the pool for that modality", () => {
    const shared = deps();
    shared.pool.join(TRUCO_ID, { pointsToWin: 15 }, { connectionId: "c1", playerId: "p1" }, GLOBAL_POOL_KEY);
    const url = new URL(`https://play.hexdev/presence?gameId=${TRUCO_ID}`);
    const result = handlePresenceRequest(url, "203.0.113.1", shared);
    const body = JSON.parse(result.body) as readonly LobbyDisplayEntry[];
    const fifteen = body.find((entry) => entry.modality.pointsToWin === 15);
    expect(fifteen).toEqual({ modality: { pointsToWin: 15 }, waitingCount: 1, promoteBotFallback: false });
  });

  it("rejects a request with no gameId", () => {
    const url = new URL("https://play.hexdev/presence");
    const result = handlePresenceRequest(url, "203.0.113.1", deps());
    expect(result.status).toBe(400);
  });

  it("rejects a gameId not present in the registry", () => {
    const url = new URL("https://play.hexdev/presence?gameId=not-a-real-game");
    const result = handlePresenceRequest(url, "203.0.113.1", deps());
    expect(result.status).toBe(404);
  });

  it("rate-limits repeated polling from the same IP", () => {
    const shared = deps({ ipLimit: 1 });
    const url = new URL(`https://play.hexdev/presence?gameId=${TRUCO_ID}`);
    handlePresenceRequest(url, "203.0.113.1", shared);
    const second = handlePresenceRequest(url, "203.0.113.1", shared);
    expect(second.status).toBe(429);
  });
});
