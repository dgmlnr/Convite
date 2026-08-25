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

  it("defaults to DEFAULT_THINKING_DELAY_MS when no delay is given", async () => {
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

/**
 * A move that is SPOKEN gets more room than a move that is PLAYED.
 *
 * Reported twice from real 2v2 play, the second time after the flat pause had
 * already been raised once: "siguen siendo demasiado rápidos". A card is
 * self-evident and permanent the moment it lands, so it never needed reading
 * time; a call appears, is marked on a seat, and goes — and three bots can
 * chain them. One number could not serve both without either leaving calls
 * unreadable or turning twelve card plays into a minute of waiting.
 */
describe("withThinkingDelay — a per-action pause for moves that have to be READ", () => {
  const playCard: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 1 } };

  it("tops a spoken move up to its own total, in a second sleep", async () => {
    const strategy: BotStrategy<PlayerView, Action> = { chooseAction: () => legalAction };
    const { sleep, calls } = fakeSleep();

    await withThinkingDelay(strategy, 1000, sleep, (action) => (action.type === "call-truco" ? 2500 : 1000)).chooseAction(fixtureView, [legalAction], 50);

    // The base still runs concurrently with the strategy — only the top-up
    // can wait, because until the strategy answers there is no action to
    // classify. So the two sleeps together are the total, not two totals.
    expect(calls).toEqual([1000, 1500]);
  });

  it("leaves a played move on the base pause — no second sleep at all", async () => {
    const strategy: BotStrategy<PlayerView, Action> = { chooseAction: () => playCard };
    const { sleep, calls } = fakeSleep();

    await withThinkingDelay(strategy, 1000, sleep, (action) => (action.type === "call-truco" ? 2500 : 1000)).chooseAction(fixtureView, [playCard], 50);

    expect(calls).toEqual([1000]);
  });

  it("treats the base as a FLOOR: a resolver asking for less is ignored", async () => {
    // A resolver is only ever allowed to slow a move down. Letting it shorten
    // one would make the base pause a suggestion, and the base is what keeps
    // an instant bot from feeling artificial in the first place.
    const strategy: BotStrategy<PlayerView, Action> = { chooseAction: () => legalAction };
    const { sleep, calls } = fakeSleep();

    await withThinkingDelay(strategy, 1000, sleep, () => 200).chooseAction(fixtureView, [legalAction], 50);

    expect(calls).toEqual([1000]);
  });

  it("without a resolver, nothing changes for any action", async () => {
    const strategy: BotStrategy<PlayerView, Action> = { chooseAction: () => playCard };
    const { sleep, calls } = fakeSleep();

    await withThinkingDelay(strategy, DEFAULT_THINKING_DELAY_MS, sleep).chooseAction(fixtureView, [playCard], 50);

    expect(calls).toEqual([DEFAULT_THINKING_DELAY_MS]);
  });
});
