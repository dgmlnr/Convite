import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limiter.js";

function fakeClock(startMs = 0) {
  let now = startMs;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("createRateLimiter (hardening: /embed + room join, obs 2945)", () => {
  it("allows requests up to the configured limit within a window", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect(limiter.tryConsume("ip-a")).toBe(true);
    expect(limiter.tryConsume("ip-a")).toBe(true);
    expect(limiter.tryConsume("ip-a")).toBe(true);
  });

  it("rejects the request that exceeds the limit within the same window", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    limiter.tryConsume("ip-a");
    limiter.tryConsume("ip-a");
    expect(limiter.tryConsume("ip-a")).toBe(false);
  });

  it("allows a request again once the window elapses, using the injected clock — never real time", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, clock: clock.now });
    expect(limiter.tryConsume("ip-a")).toBe(true);
    expect(limiter.tryConsume("ip-a")).toBe(false);
    clock.advance(1000);
    expect(limiter.tryConsume("ip-a")).toBe(true);
  });

  it("tracks separate keys independently — one key's limit does not affect another's", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.tryConsume("ip-a")).toBe(true);
    expect(limiter.tryConsume("ip-a")).toBe(false);
    expect(limiter.tryConsume("ip-b")).toBe(true);
  });

  it("bounds tracked-key memory under a flood of distinct keys: stale entries are swept once maxTrackedKeys is reached", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 100, clock: clock.now, maxTrackedKeys: 3 });
    for (let i = 0; i < 3; i += 1) limiter.tryConsume(`ip-${i}`);
    expect(limiter.size()).toBe(3);
    clock.advance(200); // every tracked window is now stale
    limiter.tryConsume("ip-new"); // size >= maxTrackedKeys triggers a sweep before insertion
    expect(limiter.size()).toBe(1); // the 3 stale entries were evicted, only the fresh one remains
  });
});
