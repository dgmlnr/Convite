import { afterAll, beforeAll } from "vitest";
import { Redis } from "ioredis";
import { readRedisTestUrl } from "./redis-test-harness.js";
import { createRedisRateLimiter } from "./redis-rate-limiter.js";
import { describeRateLimiterContract } from "./rate-limiter.contract.js";

/**
 * Runs the EXACT SAME conformance suite `rate-limiter.test.ts` runs against
 * the in-memory adapter, against a REAL Redis (per `redis-tests/global-
 * setup.ts`, started by `pnpm test:redis`) — the apply prompt's own bar: "an
 * adapter that passes the in-memory adapter's own contract tests is worth
 * more than bespoke tests." `advance` here is a REAL `setTimeout` delay:
 * Redis's own key TTL is real wall-clock time on the Redis server, not
 * something a fake clock in THIS process can influence.
 */
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

describeRateLimiterContract(
  "redis",
  (limit, windowMs) => {
    counter += 1;
    return createRedisRateLimiter({ redis, limit, windowMs, keyPrefix: `test:ratelimit:${String(process.pid)}:${String(counter)}` });
  },
  delay,
);
