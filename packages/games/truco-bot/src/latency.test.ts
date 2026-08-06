import { describe, expect, it, vi } from "vitest";
import type { Action, PlayerId, PlayerView } from "@hexdev/truco-engine";
import type { BotStrategy } from "@hexdev/platform-contract";
import { DEFAULT_THINKING_DELAY_MS, withThinkingDelay } from "./latency.js";

const SELF = "player-a" as PlayerId;
const fixtureView = {} as PlayerView;
const legalAction: Action = { type: "call-truco", playerId: SELF, level: "truco" };

function fakeSleep() {
  const calls: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    calls.push(ms);
    return Promise.resolve();
  };
  return { sleep, calls };
}

describe("withThinkingDelay", () => {
  it("returns the wrapped strategy's chosen action, unchanged", async () => {
    const strategy: BotStrategy<PlayerView, Action> = { chooseAction: () => legalAction };
    const { sleep } = fakeSleep();
    const wrapped = withThinkingDelay(strategy, 1000, sleep);
    await expect(wrapped.chooseAction(fixtureView, [legalAction], 50)).resolves.toBe(legalAction);
  });

  it("requests the configured delay from the injected sleep, not a hardcoded value (triangulation)", async () => {
    const strategy: BotStrategy<PlayerView, Action> = { chooseAction: () => legalAction };
    const { sleep, calls } = fakeSleep();
    await withThinkingDelay(strategy, 250, sleep).chooseAction(fixtureView, [legalAction], 50);
    expect(calls).toEqual([250]);
  });

  it("defaults to DEFAULT_THINKING_DELAY_MS (~1s) when no delay is given", async () => {
    const strategy: BotStrategy<PlayerView, Action> = { chooseAction: () => legalAction };
    const { sleep, calls } = fakeSleep();
    await withThinkingDelay(strategy, undefined, sleep).chooseAction(fixtureView, [legalAction], 50);
    expect(calls).toEqual([DEFAULT_THINKING_DELAY_MS]);
  });

  it("works when the wrapped strategy is itself synchronous (no await inside the strategy)", async () => {
    let calledSynchronously = false;
    const strategy: BotStrategy<PlayerView, Action> = {
      chooseAction: () => {
        calledSynchronously = true;
        return legalAction;
      },
    };
    const { sleep } = fakeSleep();
    const result = await withThinkingDelay(strategy, 10, sleep).chooseAction(fixtureView, [legalAction], 50);
    expect(calledSynchronously).toBe(true);
    expect(result).toBe(legalAction);
  });

  it("real sleep (no injection) actually elapses real time — proves the default is not a no-op", async () => {
    vi.useFakeTimers();
    const strategy: BotStrategy<PlayerView, Action> = { chooseAction: () => legalAction };
    const promise = withThinkingDelay(strategy, 20).chooseAction(fixtureView, [legalAction], 50);
    let resolved = false;
    void Promise.resolve(promise).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(resolved).toBe(true);
    vi.useRealTimers();
  });
});
