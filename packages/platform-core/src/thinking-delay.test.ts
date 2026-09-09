import { describe, expect, it, vi } from "vitest";
import type { BotStrategy } from "@hexdev/platform-contract";
import { withThinkingDelay } from "./thinking-delay.js";

/**
 * Neutral local fixture, not any game's real engine type — `platform-core`
 * must never import a specific game's engine package, which would invert
 * the whole point of a shared L1 utility. Two action "kinds" are enough to
 * exercise `delayForAction`'s spoken/played distinction generically.
 */
type Action = { readonly kind: "spoken" | "played" };

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
    const action: Action = { kind: "played" };
    const strategy: BotStrategy<null, Action> = { chooseAction: () => action };
    const { sleep } = fakeSleep();

    await expect(withThinkingDelay(strategy, 1000, sleep).chooseAction(null, [action], 50)).resolves.toBe(action);
  });

  it("requests the configured delay from the injected sleep, not a hardcoded value (triangulation)", async () => {
    const action: Action = { kind: "played" };
    const strategy: BotStrategy<null, Action> = { chooseAction: () => action };
    const { sleep, calls } = fakeSleep();

    await withThinkingDelay(strategy, 250, sleep).chooseAction(null, [action], 50);

    expect(calls).toEqual([250]);
  });

  /**
   * The wrapper is a PRESENTATION pause, so a strategy that throws has to
   * keep throwing through it — swallowing it here would silently undo
   * whatever invariant guard the wrapped strategy relies on, one layer up.
   */
  it("a strategy that throws still throws through the wrapper", async () => {
    const strategy: BotStrategy<null, Action> = {
      chooseAction: () => {
        throw new Error("no legal actions");
      },
    };

    await expect(withThinkingDelay(strategy, 10, async () => {}).chooseAction(null, [], 0)).rejects.toThrow(/no legal actions/);
  });

  /**
   * THE CONCURRENCY CLAIM, FENCED. This module's own docblock says the
   * strategy and the delay run CONCURRENTLY, so total latency is
   * `max(strategyTime, delayMs)` rather than their sum. Every assertion
   * above checked only that the action comes back and that `sleep` was
   * called with the right number — and rewriting the `Promise.all` as
   * `await sleep(...)` then `await strategy...` PASSES ALL OF THEM. The
   * claim the comment makes is the one thing nothing else here measures.
   *
   * What it costs if it breaks: the pause stops overlapping the decision
   * and starts adding to it. A bot that answered in 2.4s answers in 2.4
   * plus however long it thinks, on every single turn, and nothing goes
   * red.
   *
   * Asserted BY ORDER rather than by a clock, so it cannot flake: the
   * strategy is invoked while the `Promise.all` array is being built, so it
   * has already answered by the time `sleep` starts. Sequential code cannot
   * produce that order.
   */
  it("runs the strategy BEFORE the sleep resolves, not after it — max, never the sum", async () => {
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
   * Real sleep (no `sleep` injection) actually elapses real time — proves
   * the kept default (`sleep: Sleep = realSleep`) is not a no-op. Every
   * other test here injects a fake `sleep`, which is exactly the shape of
   * gap this file's own guidance warns about: a mock that always stands in
   * for the real thing never proves the real thing works.
   */
  it("real sleep (no injection) actually elapses real time", async () => {
    vi.useFakeTimers();
    const action: Action = { kind: "played" };
    const strategy: BotStrategy<null, Action> = { chooseAction: () => action };
    const promise = withThinkingDelay(strategy, 20).chooseAction(null, [action], 50);
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

/**
 * A move that is SPOKEN gets more room than a move that is PLAYED. Adapted
 * from `truco-bot`'s own test file (the only one of the three that exercised
 * `delayForAction`), with `truco-engine`'s `Action` fixture replaced by the
 * minimal local `Action` type above — the mechanism has no opinion about
 * which of a game's moves are spoken and which are played; that classifier
 * is supplied by the caller (`truco-module`).
 */
describe("withThinkingDelay — a per-action pause for moves that have to be READ", () => {
  const spokenAction: Action = { kind: "spoken" };
  const playedAction: Action = { kind: "played" };
  const delayForAction = (action: Action): number => (action.kind === "spoken" ? 2500 : 1000);

  it("tops a spoken move up to its own total, in a second sleep", async () => {
    const strategy: BotStrategy<null, Action> = { chooseAction: () => spokenAction };
    const { sleep, calls } = fakeSleep();

    await withThinkingDelay(strategy, 1000, sleep, delayForAction).chooseAction(null, [spokenAction], 50);

    // The base still runs concurrently with the strategy — only the top-up
    // can wait, because until the strategy answers there is no action to
    // classify. So the two sleeps together are the total, not two totals.
    expect(calls).toEqual([1000, 1500]);
  });

  it("leaves a played move on the base pause — no second sleep at all", async () => {
    const strategy: BotStrategy<null, Action> = { chooseAction: () => playedAction };
    const { sleep, calls } = fakeSleep();

    await withThinkingDelay(strategy, 1000, sleep, delayForAction).chooseAction(null, [playedAction], 50);

    expect(calls).toEqual([1000]);
  });

  it("treats the base as a FLOOR: a resolver asking for less is ignored", async () => {
    // A resolver is only ever allowed to slow a move down. Letting it
    // shorten one would make the base pause a suggestion, and the base is
    // what keeps an instant bot from feeling artificial in the first place.
    const strategy: BotStrategy<null, Action> = { chooseAction: () => spokenAction };
    const { sleep, calls } = fakeSleep();

    await withThinkingDelay(strategy, 1000, sleep, () => 200).chooseAction(null, [spokenAction], 50);

    expect(calls).toEqual([1000]);
  });

  it("without a resolver, nothing changes for any action", async () => {
    const strategy: BotStrategy<null, Action> = { chooseAction: () => playedAction };
    const { sleep, calls } = fakeSleep();

    await withThinkingDelay(strategy, 1000, sleep).chooseAction(null, [playedAction], 50);

    expect(calls).toEqual([1000]);
  });
});
