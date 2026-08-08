import type { Clock } from "@hexdev/platform-contract";

/**
 * A fixed-window per-key rate limiter (design §7 names rate limiting as part
 * of `/embed`/room-join defense-in-depth; obs 2945 flagged `/embed` as now a
 * REAL, unauthenticated, unlimited endpoint). HONESTY: per-key limiting by
 * source IP is defeated by a distributed attacker using many addresses —
 * this stops trivial/accidental abuse from one source, not a determined one.
 *
 * The clock is ALWAYS injected, never `Date.now()` called directly inside
 * this module's own logic — callers that omit `clock` get a real one, tests
 * can advance a fake one without real time passing.
 */
export interface RateLimiterOptions {
  readonly limit: number;
  readonly windowMs: number;
  readonly clock?: Clock;
  /** Caps how many distinct keys are tracked at once, so a flood of unique
   * keys (e.g. many source IPs) cannot grow this limiter's memory without
   * bound — the same memory-exhaustion shape `JtiReplayGuard` had. */
  readonly maxTrackedKeys?: number;
}

/**
 * PORT SHAPE, widened for horizontal scaling: both methods are `async`
 * (`Promise`-returning) even though this file's own in-memory adapter never
 * awaits anything internally. A Redis-backed adapter's `tryConsume` is
 * inherently a network round trip — there is no honest synchronous shape for
 * a port that must also support a shared-store implementation. Every call
 * site now `await`s these calls; the in-memory adapter's behavior and
 * atomicity are unchanged, only the calling convention is.
 */
export interface RateLimiter {
  /** `true` = allowed and consumed against the key's budget; `false` = the
   * key is over its limit for the current window. */
  tryConsume(key: string): Promise<boolean>;
  /** Distinct keys currently tracked — exposed so the memory bound can be
   * observed directly (tests, monitoring), not just inferred from outside. */
  size(): Promise<number>;
}

interface Bucket {
  count: number;
  windowStart: number;
}

const DEFAULT_MAX_TRACKED_KEYS = 10_000;

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const clock = options.clock ?? Date.now;
  const maxTrackedKeys = options.maxTrackedKeys ?? DEFAULT_MAX_TRACKED_KEYS;
  const buckets = new Map<string, Bucket>();

  function sweepExpired(now: number): void {
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart >= options.windowMs) buckets.delete(key);
    }
  }

  return {
    async tryConsume(key) {
      const now = clock();
      const existing = buckets.get(key);
      if (existing !== undefined && now - existing.windowStart < options.windowMs) {
        if (existing.count >= options.limit) return false;
        existing.count += 1;
        return true;
      }
      if (buckets.size >= maxTrackedKeys) sweepExpired(now);
      buckets.set(key, { count: 1, windowStart: now });
      return true;
    },
    size: () => Promise.resolve(buckets.size),
  };
}
