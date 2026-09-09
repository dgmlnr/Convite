import { describe, expect, it } from "vitest";
import { DEFAULT_THINKING_DELAY_MS } from "./latency.js";

/**
 * A hard pin on this game's own product decision — cheap insurance against
 * someone changing the number unnoticed. The wrapper mechanism itself
 * (concurrency via `Promise.all`/max-not-sum, throw-through) moved to
 * `@hexdev/platform-core` along with the `withThinkingDelay` function it
 * tests; see that package's own `thinking-delay.test.ts` for the
 * mechanism's tests.
 */
describe("escoba-bot's own latency constant", () => {
  it("pins DEFAULT_THINKING_DELAY_MS to 2400 — see latency.ts for why escoba needs only one pause", () => {
    expect(DEFAULT_THINKING_DELAY_MS).toBe(2400);
  });
});
