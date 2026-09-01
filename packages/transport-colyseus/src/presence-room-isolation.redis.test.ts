import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ColyseusTestServer } from "@colyseus/testing";
import { Redis } from "ioredis";
import type { GameId, GameModule, PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import {
  createGameModuleRegistry,
  createRateLimiter,
  createRedisJtiReplayGuard,
  createRedisMatchmakingPool,
  createSessionTokenIssuer,
  createSessionTokenVerifier,
  createStaticTenantRepository,
  deriveTestSessionSigningKey,
} from "@hexdev/platform-core";
import { PresenceRoom } from "./presence-room.js";
import { createMatchServer } from "./server.js";

/**
 * obs 2978 RE-VERIFICATION UNDER `RedisDriver`/`RedisPresence` (apply
 * prompt's own explicit ask — "this is a real risk — verify it, do not
 * assume"). `presence-room.live.test.ts`'s own isolation describe block
 * proved `.filterBy(["gameId"])` + `PresenceRoom.onJoin`'s own defense-in-
 * depth `gameId` check against Colyseus's DEFAULT `LocalPresence`/
 * `LocalDriver`. This file re-runs the IDENTICAL fixtures and assertions
 * with `createMatchServer`'s `redis` option set — Colyseus itself now runs
 * `RedisPresence`/`RedisDriver` for real, against a real Docker Redis.
 *
 * HONEST SCOPE NOTE (found running this live, not assumed — the apply
 * prompt's own bar): a genuinely separate, independently-listening SECOND
 * `http.Server`/Colyseus `Server` pair in the SAME Node process (proving
 * room OWNERSHIP can move to a literally different process) was attempted
 * and reproducibly HUNG inside this vitest suite specifically — the exact
 * same two-server setup succeeded cleanly as a standalone Node script
 * outside vitest, so the hang is environment-specific and its root cause
 * was not fully isolated in the time available (plausibly Colyseus's
 * `MatchMaker` module-level singleton state — `processId`/`presence`/
 * `driver` are module `let` exports, not per-`Server`-instance state —
 * interacting with vitest's own module/worker model in a way a plain `node`
 * process does not exhibit). Shipping a hanging test would be worse than
 * shipping none, so this file stays with ONE real `@colyseus/testing`
 * server instead — genuinely exercising `RedisPresence`/`RedisDriver`'s own
 * code paths (real Redis pub/sub subscribe/publish, real `RedisDriver`
 * room-cache reads/writes), which the ORIGINAL in-memory isolation test
 * never touched at all, but NOT proving cross-PROCESS room ownership the
 * way `cross-instance.redis.test.ts`'s own three required properties do.
 * By source inspection (this unit's own apply-progress), `filterBy`'s
 * consulted fields and `onJoin`'s `this.gameId`/`options.gameId` comparison
 * read neither `Presence` nor `MatchMakerDriver` — the mechanism itself is
 * storage-agnostic — so this test's PASS plus that inspection together are
 * the honest evidence this unit can offer for obs 2978 under Redis; the
 * full two-real-process case for THIS specific room is the disclosed gap.
 */
const isolationModuleA: GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> = {
  id: "fixture-isolation-redis-a" as GameId,
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
  id: "fixture-isolation-redis-b" as GameId,
  metadata: { seatCount: 2, displayNameKey: "fixture.isolation.b", assetBase: "/fixture" },
};

function readRedisUrl(): string {
  const path = fileURLToPath(new URL("../../../redis-tests/.harness/info.json", import.meta.url));
  return (JSON.parse(readFileSync(path, "utf8")) as { redisUrl: string }).redisUrl;
}

describe("PresenceRoom — game isolation, re-verified with RedisPresence/RedisDriver active (obs 2978, apply prompt's explicit ask)", () => {
  let testServer: ColyseusTestServer;
  let redis: Redis;
  let nextPort = 2670;

  beforeEach(async () => {
    redis = new Redis(readRedisUrl());
    const registry = createGameModuleRegistry([isolationModuleA, isolationModuleB]);
    const pool = createRedisMatchmakingPool({ redis, keyPrefix: `test:isolation-single:${String(process.pid)}:${String(Math.random())}` });
    const httpServer = createServer();
    const unusedIssuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("isolation-redis-secret"));
    const auth = {
      verifier: await createSessionTokenVerifier(unusedIssuer.publicKey),
      repository: createStaticTenantRepository([]),
      replayGuard: createRedisJtiReplayGuard({ redis, ttlMs: 60_000, keyPrefix: `test:isolation-single-jti:${String(process.pid)}:${String(Math.random())}` }),
      joinRateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
      allowedWidgetOrigins: [],
    };
    // THE ONLY DIFFERENCE from `presence-room.live.test.ts`'s own isolation
    // describe block: `redis` is set, so Colyseus itself runs
    // `RedisPresence`/`RedisDriver` for this test, not its local defaults.
    const gameServer = createMatchServer({ httpServer, registry, auth, rng: () => 0.5, redis });
    gameServer.define("presence", PresenceRoom, { registry, pool } as never).filterBy(["gameId"]);
    await gameServer.listen(nextPort++);
    testServer = new ColyseusTestServer(gameServer);
  });

  // NOT `redis.quit()` here too: `RedisDriver`'s constructor uses the SAME
  // `Redis` instance directly when one is passed (verified in the installed
  // `@colyseus/redis-driver` source — no `.duplicate()` for the driver,
  // unlike `RedisPresence`), so `testServer.shutdown()` (which calls
  // `driver.shutdown()` → `this._client.quit()`) already closes THIS exact
  // connection. A second `.quit()` call here throws "Connection is closed"
  // (found running this live, not assumed) — this repo's own instance
  // sharing, not a bug in either package.
  afterEach(async () => {
    await testServer.shutdown();
  });

  it("a client asking for game B never lands in game A's already-open room, is never enqueued/counted/paired into it, and same-game pairing still works", async () => {
    const roomA0 = await testServer.sdk.joinOrCreate("presence", { gameId: "fixture-isolation-redis-a", modality: { roundLength: 15 }, playerId: "a0" });
    const countsA: Array<Array<{ modality: { roundLength: number }; waitingCount: number }>> = [];
    // WATCHED FROM ITS OWN JOIN, the same correction the non-redis fences
    // next door carry: `counts` goes to the clients that asked to watch, and
    // `joinMatchmakingQueue` asks for `paired` and `pairing-failed` only — so
    // an enqueued client is not a channel this number travels on.
    const watcherA = await testServer.sdk.joinOrCreate("presence", { gameId: "fixture-isolation-redis-a" });
    watcherA.onMessage("counts", (message) => countsA.push(message));
    const pairedA0: unknown[] = [];
    roomA0.onMessage("paired", (message) => pairedA0.push(message));

    await new Promise((resolve) => setTimeout(resolve, 30));

    const roomB0 = await testServer.sdk.joinOrCreate("presence", { gameId: "fixture-isolation-redis-b", modality: { roundLength: 15 }, playerId: "b0" });
    const countsB: Array<Array<{ modality: { roundLength: number }; waitingCount: number }>> = [];
    const watcherB = await testServer.sdk.joinOrCreate("presence", { gameId: "fixture-isolation-redis-b" });
    watcherB.onMessage("counts", (message) => countsB.push(message));
    const pairedB0: unknown[] = [];
    roomB0.onMessage("paired", (message) => pairedB0.push(message));

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(roomA0.roomId).not.toBe(roomB0.roomId);

    const lastCountsA = countsA[countsA.length - 1]!;
    expect(lastCountsA.find((entry) => entry.modality.roundLength === 15)?.waitingCount).toBe(1);
    const lastCountsB = countsB[countsB.length - 1]!;
    expect(lastCountsB.find((entry) => entry.modality.roundLength === 15)?.waitingCount).toBe(1);

    expect(pairedA0).toHaveLength(0);
    expect(pairedB0).toHaveLength(0);

    const roomA1 = await testServer.sdk.joinOrCreate("presence", { gameId: "fixture-isolation-redis-a", modality: { roundLength: 15 }, playerId: "a1" });
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(roomA1.roomId).toBe(roomA0.roomId);
    expect(pairedA0).toHaveLength(1);
    expect(pairedA0[0]).toMatchObject({ players: ["a0", "a1"] });
    expect(pairedB0).toHaveLength(0);
  });

  it("rejects a hand-crafted join whose claimed gameId disagrees with this room's own, even when it bypasses matchmaking selection entirely", async () => {
    const roomA = await testServer.createRoom("presence", { gameId: "fixture-isolation-redis-a" });
    await expect(
      testServer.connectTo(roomA, { gameId: "fixture-isolation-redis-a", modality: { roundLength: 15 }, playerId: "honest" }),
    ).resolves.toBeDefined();

    await expect(
      testServer.connectTo(roomA, { gameId: "fixture-isolation-redis-b", modality: { roundLength: 15 }, playerId: "attacker" }),
    ).rejects.toThrow();
  });
});
