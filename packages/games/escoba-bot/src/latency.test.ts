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
