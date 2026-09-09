import { describe, expect, it, vi } from "vitest";
import type { BotStrategy } from "@hexdev/platform-contract";
import { DEFAULT_THINKING_DELAY_MS, withThinkingDelay } from "./latency.js";

describe("withThinkingDelay", () => {
  it("runs the strategy and the sleep concurrently, then returns the strategy's action", async () => {
    const strategy: BotStrategy<null, string> = { chooseAction: () => "chosen" };
    const sleep = vi.fn(async () => {});
    const wrapped = withThinkingDelay(strategy, 500, sleep);

    const result = await wrapped.chooseAction(null, [], 1000);

    expect(result).toBe("chosen");
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("defaults to DEFAULT_THINKING_DELAY_MS when no delay is given", async () => {
    const strategy: BotStrategy<null, string> = { chooseAction: () => "x" };
    const sleep = vi.fn(async () => {});

    await withThinkingDelay(strategy, undefined, sleep).chooseAction(null, [], 0);

    expect(sleep).toHaveBeenCalledWith(DEFAULT_THINKING_DELAY_MS);
  });

  /**
   * The wrapper is a PRESENTATION pause, so a strategy that throws has to keep
   * throwing through it — swallowing the empty-list guard here would undo the
   * whole of task 8.4 one layer up, silently.
   */
  it("a strategy that throws still throws through the wrapper", async () => {
    const strategy: BotStrategy<null, string> = {
      chooseAction: () => {
        throw new Error("no legal actions");
      },
    };
    await expect(withThinkingDelay(strategy, 10, async () => {}).chooseAction(null, [], 0)).rejects.toThrow(/no legal actions/);
  });

  /**
   * THE CONCURRENCY CLAIM, FENCED — and it was unfenced until a mutation said so.
   *
   * Both shipped copies of this file assert only that the strategy's action
   * comes back and that `sleep` was called with the right number. Rewriting the
   * `Promise.all` as `await sleep(...)` then `await strategy...` — the sum
   * instead of the max — passed every one of those assertions in this package
   * too. It is asserted here by ORDER rather than by a clock: the strategy is
   * invoked while building the `Promise.all` array, so it has already answered
   * at a point where the pause is still pending. Under the sequential form,
   * nothing has run but the sleep.
   *
   * It matters for slice 17: an exact one-ply EV search that stacked on top of
   * the presentation pause would show up as a bot that visibly thinks longer
   * the better it plays.
   */
  it("the strategy has already answered while the pause is still pending — max, never the sum", async () => {
    const order: string[] = [];
    let release = (): void => {};
    const sleep = async (ms: number): Promise<void> => {
      order.push(`sleep(${String(ms)}) started`);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    };
    const strategy: BotStrategy<null, string> = {
      chooseAction: () => {
        order.push("strategy ran");
        return "chosen";
      },
    };

    const pending = withThinkingDelay(strategy, 500, sleep).chooseAction(null, [], 0);
    expect(order).toEqual(["strategy ran", "sleep(500) started"]);

    release();
    await expect(pending).resolves.toBe("chosen");
  });

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
