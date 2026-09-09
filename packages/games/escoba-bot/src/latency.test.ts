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
});

/**
 * THE CONCURRENCY CLAIM, FENCED — and it was unfenced in this file until a
 * mutation in `generala-bot` said so.
 *
 * This file's own comment says the strategy and the delay run CONCURRENTLY,
 * so total latency is `max(strategyTime, delayMs)` rather than their sum.
 * Every assertion here checked that the action comes back and that `sleep`
 * was called with the right number — and rewriting the `Promise.all` as
 * `await sleep(...)` then `await strategy...` PASSES ALL OF THEM. The claim
 * the comment makes was the one thing nothing measured.
 *
 * What it costs if it breaks: the pause stops overlapping the decision and
 * starts adding to it. A bot that answered in 2.4 s answers in 2.4 plus
 * however long it thinks, on every single turn, and nothing goes red.
 *
 * Asserted BY ORDER rather than by a clock, so it cannot flake: the strategy
 * is invoked while the `Promise.all` array is being built, so it has already
 * answered by the time `sleep` starts. Sequential code cannot produce that
 * order.
 */
describe("withThinkingDelay — the concurrency the comment promises", () => {
  it("runs the strategy BEFORE the sleep resolves, not after it", async () => {
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
});
