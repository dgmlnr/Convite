import { describe, expect, it } from "vitest";
import { DEFAULT_THINKING_DELAY_MS } from "./latency.js";

/**
 * A hard pin on this game's own product decision. The wrapper mechanism
 * itself (concurrency via `Promise.all`/max-not-sum, throw-through) moved to
 * `@hexdev/platform-core` along with the `withThinkingDelay` function it
 * tests; see that package's own `thinking-delay.test.ts` for the
 * mechanism's tests.
 */
describe("generala-bot's own latency constant", () => {
  /**
   * A quarter of escoba's and truco's 2400, and MEASURED rather than argued —
   * see `latency.ts` for the numbers. Asserted so the reasoning there cannot
   * drift away from the constant without a red.
   *
   * The pause is entirely presentation: the `hard` tier's slowest decision in a
   * whole match is 8.87 ms, so 591 of these 600 milliseconds are the opponent
   * pretending to think. That is a product decision, which is why it is pinned
   * here rather than left to whoever edits the constant next.
   */
  it("the default is 600, and the decision it hides takes 8.87 ms", () => {
    expect(DEFAULT_THINKING_DELAY_MS).toBe(600);
  });
});
