import { describe, expect, it } from "vitest";
import { DEFAULT_THINKING_DELAY_MS, SPOKEN_MOVE_DELAY_MS } from "./latency.js";

/**
 * Hard pins on this game's own product decisions — cheap insurance against
 * someone changing either number unnoticed. The wrapper mechanism itself
 * (concurrency via `Promise.all`/max-not-sum, throw-through, the
 * `delayForAction` top-up/floor semantics) moved to `@hexdev/platform-core`
 * along with the `withThinkingDelay` function it tests; see that package's
 * own `thinking-delay.test.ts` for the mechanism's tests.
 */
describe("truco-bot's own latency constants", () => {
  it("pins DEFAULT_THINKING_DELAY_MS to 2400 — see latency.ts for the chip-timing math behind it", () => {
    expect(DEFAULT_THINKING_DELAY_MS).toBe(2400);
  });

  it("pins SPOKEN_MOVE_DELAY_MS to 3600 — see latency.ts for why a spoken move needs more room than a played one", () => {
    expect(SPOKEN_MOVE_DELAY_MS).toBe(3600);
  });
});
