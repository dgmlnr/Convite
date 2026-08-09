import type { Redis } from "ioredis";
import type { RateLimiter } from "./rate-limiter.js";

/**
 * Redis-backed `RateLimiter` (see `rate-limiter.ts`'s own docstring for the
 * port's async shape and the honest per-source-IP limitation). Closes the
 * silent breakage the in-memory adapter has under N processes: each process
 * enforcing its OWN budget means N processes give N times the configured
 * ceiling — a limit that quietly stops being a limit, never an error.
 *
 * Fixed window, same algorithm as `createRateLimiter` — but the window
 * itself lives in REDIS's own key TTL, not a per-process `Map`. `INCR` +
 * conditional `PEXPIRE` run as ONE Lua script so the "first hit in this
 * window sets the TTL" decision is atomic across every process sharing this
 * Redis, never a race between two processes' first hit landing at once.
 */
export interface RedisRateLimiterOptions {
  readonly redis: Redis;
  readonly limit: number;
  readonly windowMs: number;
  /** Every key this limiter touches is namespaced under this prefix — REQUIRED,
   * not defaulted, because multiple `RateLimiter` instances (embed-by-IP,
   * embed-by-key, join-by-IP) share ONE Redis in the horizontal-scaling
   * config (composition root, `apps/server/src/config.ts`); an unprefixed
   * key would let one limiter's "ip-a" collide with another's. */
  readonly keyPrefix: string;
}

// Atomic: the window's TTL is set ONLY on the hit that creates the key
// (current == 1), so a slow second caller can never re-arm/extend a window
// another caller already started — the same "fixed window" semantics as the
// in-memory adapter, just enforced by Redis instead of a per-process clock.
const TRY_CONSUME_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
if current > tonumber(ARGV[2]) then
  return 0
else
  return 1
end
`;

export function createRedisRateLimiter(options: RedisRateLimiterOptions): RateLimiter {
  const { redis, limit, windowMs, keyPrefix } = options;
  const namespacedKey = (key: string) => `${keyPrefix}:${key}`;

  return {
    async tryConsume(key) {
      const result = await redis.eval(TRY_CONSUME_SCRIPT, 1, namespacedKey(key), windowMs, limit);
      return result === 1;
    },
    // SCAN, never KEYS: non-blocking, safe against a large keyspace shared
    // by other adapters/limiters on the same Redis. Test/monitoring use
    // only (per the port's own docstring) — never called on a request path.
    async size() {
      let cursor = "0";
      let count = 0;
      do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `${keyPrefix}:*`, "COUNT", 1000);
        cursor = nextCursor;
        count += keys.length;
      } while (cursor !== "0");
      return count;
    },
  };
}
