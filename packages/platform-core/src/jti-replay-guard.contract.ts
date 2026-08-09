import { describe, expect, it } from "vitest";
import type { JtiReplayGuard } from "./tenant-auth.js";

/**
 * Executable conformance suite for the `JtiReplayGuard` port — same
 * discipline and same reasoning as `rate-limiter.contract.ts`'s own
 * docstring. Both `tenant-auth.test.ts` (in-memory) and
 * `redis-jti-replay-guard.live.test.ts` (real Redis) run this EXACT suite.
 */
export function describeJtiReplayGuardContract(name: string, create: (ttlMs: number) => JtiReplayGuard, advance: (ms: number) => Promise<void>): void {
  describe(`JtiReplayGuard contract — ${name}`, () => {
    it("accepts a jti once, then rejects the same jti as a replay", async () => {
      const guard = create(60_000);
      expect(await guard.consume("jti-1")).toBe(true);
      expect(await guard.consume("jti-1")).toBe(false);
    });

    it("tracks separate jtis independently", async () => {
      const guard = create(60_000);
      expect(await guard.consume("jti-a")).toBe(true);
      expect(await guard.consume("jti-b")).toBe(true);
      expect(await guard.consume("jti-a")).toBe(false);
    });

    it("re-accepts a jti once its TTL elapses — safe, because the token it belonged to has itself expired by then", async () => {
      const guard = create(50);
      expect(await guard.consume("jti-1")).toBe(true);
      await advance(60);
      expect(await guard.consume("jti-1")).toBe(true);
    });
  });
}
