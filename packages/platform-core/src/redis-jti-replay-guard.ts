import type { Redis } from "ioredis";
import type { JtiReplayGuard } from "./tenant-auth.js";

/**
 * Redis-backed `JtiReplayGuard` (see `tenant-auth.ts`'s own docstring: this
 * is the SECURITY hole this whole unit exists to close, not a performance
 * one — a `jti` replayed against a DIFFERENT process was invisible to the
 * in-memory adapter, silently reopening the single-use guarantee `onAuth`
 * depends on).
 *
 * `consume` is ONE atomic Redis command: `SET key 1 PX ttlMs NX`. `NX`
 * ("only set if not already set") IS the check-and-mark — there is no
 * separate read-then-write, so there is no race window for two processes to
 * both observe "not yet seen" for the same jti and both accept it. Redis
 * itself expires the key after `ttlMs`, matching the in-memory adapter's own
 * TTL-based eviction (a jti cannot be replayed after its own token has
 * already expired, so holding it any longer is pure waste — same reasoning,
 * enforced by Redis's own key expiry instead of a per-process sweep).
 */
export interface RedisJtiReplayGuardOptions {
  readonly redis: Redis;
  /** Token lifetime in ms — same meaning as `JtiReplayGuardOptions.ttlMs`. */
  readonly ttlMs: number;
  /** Namespaces every key this guard touches — required for the same reason
   * as `RedisRateLimiterOptions.keyPrefix`: multiple Redis-backed adapters
   * can share one Redis instance in the horizontal-scaling config. */
  readonly keyPrefix: string;
}

export function createRedisJtiReplayGuard(options: RedisJtiReplayGuardOptions): JtiReplayGuard {
  const { redis, ttlMs, keyPrefix } = options;
  const namespacedKey = (jti: string) => `${keyPrefix}:${jti}`;

  return {
    async consume(jti) {
      // ioredis's `set(key, value, "PX", ms, "NX")` overload maps 1:1 to
      // `SET key value PX ms NX` — returns "OK" on a fresh key (accepted,
      // first use), null when the key already exists (replay, rejected).
      const result = await redis.set(namespacedKey(jti), "1", "PX", ttlMs, "NX");
      return result === "OK";
    },
    // SCAN, never KEYS — test/monitoring use only, matches
    // `createRedisRateLimiter.size()`'s own reasoning.
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
