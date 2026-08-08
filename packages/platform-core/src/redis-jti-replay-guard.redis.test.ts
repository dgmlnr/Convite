import { afterAll, beforeAll } from "vitest";
import { Redis } from "ioredis";
import { readRedisTestUrl } from "./redis-test-harness.js";
import { createRedisJtiReplayGuard } from "./redis-jti-replay-guard.js";
import { describeJtiReplayGuardContract } from "./jti-replay-guard.contract.js";

/** Same reasoning as `redis-rate-limiter.redis.test.ts`'s own doc comment. */
let redis: Redis;
let counter = 0;

beforeAll(() => {
  redis = new Redis(readRedisTestUrl());
});

afterAll(async () => {
  await redis.quit();
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describeJtiReplayGuardContract(
  "redis",
  (ttlMs) => {
    counter += 1;
    return createRedisJtiReplayGuard({ redis, ttlMs, keyPrefix: `test:jti:${String(process.pid)}:${String(counter)}` });
  },
  delay,
);
