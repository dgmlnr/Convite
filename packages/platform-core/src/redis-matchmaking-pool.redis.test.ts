import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { readRedisTestUrl } from "./redis-test-harness.js";
import { createRedisMatchmakingPool } from "./redis-matchmaking-pool.js";
import { describeMatchmakingPoolContract } from "./matchmaking-pool.contract.js";

let redis: Redis;
let counter = 0;

beforeAll(() => {
  redis = new Redis(readRedisTestUrl());
});

afterAll(async () => {
  await redis.quit();
});

function nextPool() {
  counter += 1;
  return createRedisMatchmakingPool({ redis, keyPrefix: `test:pool:${String(process.pid)}:${String(counter)}` });
}

describeMatchmakingPoolContract("redis", nextPool);

/**
 * THE property this adapter exists for, proven at the port level (the full
 * two-SERVER-PROCESS proof lives in `redis-tests/cross-instance.redis.
 * test.ts` — this is the narrower, faster proof that the STORAGE itself is
 * genuinely shared, isolated from Colyseus/HTTP entirely): TWO SEPARATE
 * `MatchmakingPool` instances — standing in for two server processes, each
 * with its own JS heap and its own `Map` if this were the in-memory adapter
 * — pointed at the SAME Redis. A player who joined via instance A must pair
 * with a player who joined via instance B. The in-memory adapter CANNOT
 * pass this test even in principle: two `createMatchmakingPool()` calls
 * never share state, which is exactly the silent breakage this whole unit
 * exists to close.
 */
describe("RedisMatchmakingPool — cross-instance pairing (the property this adapter exists for)", () => {
  it("a player queued on pool instance A pairs with a player queued on pool instance B", async () => {
    counter += 1;
    const keyPrefix = `test:pool:${String(process.pid)}:${String(counter)}`;
    const instanceA = createRedisMatchmakingPool({ redis, keyPrefix });
    const instanceB = createRedisMatchmakingPool({ redis, keyPrefix }); // SAME keyPrefix: simulates a second process sharing the same Redis

    await instanceA.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "on-instance-a", playerId: "player-a" });
    // Instance A alone cannot pair — only one player has joined so far,
    // proving this is not a trivial "any pool call always pairs" stub.
    expect(await instanceA.tryPair("truco-argentino", { pointsToWin: 15 })).toBeNull();

    await instanceB.join("truco-argentino", { pointsToWin: 15 }, { connectionId: "on-instance-b", playerId: "player-b" });
    // Instance B's own view already reflects instance A's earlier join —
    // proving the count is genuinely shared, not instance-local.
    expect(await instanceB.count("truco-argentino", { pointsToWin: 15 })).toBe(2);

    const pairing = await instanceB.tryPair("truco-argentino", { pointsToWin: 15 });
    expect(pairing).toEqual({
      a: { connectionId: "on-instance-a", playerId: "player-a" },
      b: { connectionId: "on-instance-b", playerId: "player-b" },
    });
    // Both instances now see the queue as empty — the pairing was a single
    // shared mutation, not two independent, silently-diverged views of it.
    expect(await instanceA.count("truco-argentino", { pointsToWin: 15 })).toBe(0);
    expect(await instanceB.count("truco-argentino", { pointsToWin: 15 })).toBe(0);
  });
});
