import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limiter.js";

function fakeClock(startMs = 0) {
  let now = startMs;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("createRateLimiter (hardening: /embed + room join, obs 2945)", () => {
  it("allows requests up to the configured limit within a window", async () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect(await limiter.tryConsume("ip-a")).toBe(true);
    expect(await limiter.tryConsume("ip-a")).toBe(true);
    expect(await limiter.tryConsume("ip-a")).toBe(true);
  });

  it("rejects the request that exceeds the limit within the same window", async () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    await limiter.tryConsume("ip-a");
    await limiter.tryConsume("ip-a");
    expect(await limiter.tryConsume("ip-a")).toBe(false);
  });

  it("allows a request again once the window elapses, using the injected clock — never real time", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, clock: clock.now });
    expect(await limiter.tryConsume("ip-a")).toBe(true);
    expect(await limiter.tryConsume("ip-a")).toBe(false);
    clock.advance(1000);
    expect(await limiter.tryConsume("ip-a")).toBe(true);
  });

  it("tracks separate keys independently — one key's limit does not affect another's", async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(await limiter.tryConsume("ip-a")).toBe(true);
    expect(await limiter.tryConsume("ip-a")).toBe(false);
    expect(await limiter.tryConsume("ip-b")).toBe(true);
  });

  it("bounds tracked-key memory under a flood of distinct keys: stale entries are swept once maxTrackedKeys is reached", async () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 100, clock: clock.now, maxTrackedKeys: 3 });
    for (let i = 0; i < 3; i += 1) await limiter.tryConsume(`ip-${i}`);
    expect(await limiter.size()).toBe(3);
    clock.advance(200); // every tracked window is now stale
    await limiter.tryConsume("ip-new"); // size >= maxTrackedKeys triggers a sweep before insertion
    expect(await limiter.size()).toBe(1); // the 3 stale entries were evicted, only the fresh one remains
  });
});
