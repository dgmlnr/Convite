import { describe, expect, it } from "vitest";
import type { RateLimiter } from "./rate-limiter.js";

/**
 * Executable conformance suite for the `RateLimiter` port (same discipline as
 * `platform-contract`'s `describeGameModule`): "an adapter that passes the
 * in-memory adapter's own contract tests is worth more than bespoke tests"
 * (apply prompt). Both `rate-limiter.test.ts` (in-memory) and
 * `redis-rate-limiter.live.test.ts` (real Redis) run this EXACT suite.
 *
 * `advance` is injected rather than a fake clock directly: the in-memory
 * adapter accepts a `clock` function and advances it synchronously, but a
 * Redis-backed window lives in REDIS's own key TTL (real wall-clock time,
 * server-side) — there is no way to fake Redis's own clock from the test
 * process. `advance` abstracts "make windowMs of time pass" for either case.
 */
export function describeRateLimiterContract(name: string, create: (limit: number, windowMs: number) => RateLimiter, advance: (ms: number) => Promise<void>): void {
  describe(`RateLimiter contract — ${name}`, () => {
    it("allows requests up to the configured limit within a window", async () => {
      const limiter = create(3, 60_000);
      expect(await limiter.tryConsume("ip-a")).toBe(true);
      expect(await limiter.tryConsume("ip-a")).toBe(true);
      expect(await limiter.tryConsume("ip-a")).toBe(true);
    });

    it("rejects the request that exceeds the limit within the same window", async () => {
      const limiter = create(2, 60_000);
      await limiter.tryConsume("ip-a");
      await limiter.tryConsume("ip-a");
      expect(await limiter.tryConsume("ip-a")).toBe(false);
    });

    it("allows a request again once the window elapses", async () => {
      const limiter = create(1, 50);
      expect(await limiter.tryConsume("ip-a")).toBe(true);
      expect(await limiter.tryConsume("ip-a")).toBe(false);
      await advance(60);
      expect(await limiter.tryConsume("ip-a")).toBe(true);
    });

    it("tracks separate keys independently — one key's limit does not affect another's", async () => {
      const limiter = create(1, 60_000);
      expect(await limiter.tryConsume("ip-a")).toBe(true);
      expect(await limiter.tryConsume("ip-a")).toBe(false);
      expect(await limiter.tryConsume("ip-b")).toBe(true);
    });
  });
}
