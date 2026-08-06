import type { BotStrategy } from "@hexdev/platform-contract";

/** ~1 second (spec: "Tunable Bot Move Latency") — an instant bot feels
 * artificial and, for the hard tier, would starve the determinized search
 * of any perceived "thinking" pause. Tunable via the wrapper's own
 * parameter; this is only the default. */
export const DEFAULT_THINKING_DELAY_MS = 1000;

export type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps ANY `BotStrategy` with a deliberate pause — SEPARATE from the
 * strategy itself (design §9 / spec: "lives in the controller wrapper, not
 * the strategy, so strategy unit tests stay instant"). `sleep` is injected
 * (default: a real `setTimeout`) purely so this wrapper's own tests never
 * need to wait in real time, mirroring this project's established
 * Clock-injection discipline (`createRateLimiter`, `createPresenceSweeper`).
 * Runs the strategy and the delay CONCURRENTLY (`Promise.all`), so total
 * latency is `max(strategyTime, delayMs)`, not their sum — a slow hard-tier
 * search never stacks extra wait time on top of the presentation pause.
 */
export function withThinkingDelay<TView, TAction>(
  strategy: BotStrategy<TView, TAction>,
  delayMs: number = DEFAULT_THINKING_DELAY_MS,
  sleep: Sleep = realSleep,
): BotStrategy<TView, TAction> {
  return {
    async chooseAction(view, legalActions, budgetMs) {
      const [action] = await Promise.all([
        Promise.resolve(strategy.chooseAction(view, legalActions, budgetMs)),
        sleep(delayMs),
      ]);
      return action;
    },
  };
}
