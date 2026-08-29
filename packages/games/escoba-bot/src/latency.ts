import type { BotStrategy } from "@hexdev/platform-contract";

/**
 * K.1: escoba's OWN latency module. `withThinkingDelay` already exists in
 * `truco-bot/src/latency.ts`, but importing it would make escoba-bot
 * depend on truco-bot — the same argument `l0-spanish-deck-ui-no-workspace-
 * deps`'s own comment makes for the shared deck art: escoba must not know
 * truco exists. Hoisting this to `platform-core` was rejected too (design
 * §D1) — a shared-abstraction extraction is a non-goal until a THIRD game
 * needs one. The duplication here is deliberate, not an oversight.
 *
 * Escoba has no "spoken" moves (no calls, no señas — design §D3: no consult
 * channel registered at all), so unlike `truco-bot`'s split
 * (`DEFAULT_THINKING_DELAY_MS` / `SPOKEN_MOVE_DELAY_MS`) this package needs
 * only ONE pause: a card landing on the table is self-evident the instant
 * it lands.
 */
export const DEFAULT_THINKING_DELAY_MS = 2400;

export type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps any `BotStrategy` with a deliberate pause, run CONCURRENTLY with the
 * strategy (`Promise.all`) so total latency is `max(strategyTime, delayMs)`,
 * never their sum. `sleep` is injected purely so this wrapper's own tests
 * never wait in real time — mirrors `truco-bot/src/latency.ts`'s own
 * discipline.
 */
export function withThinkingDelay<TView, TAction>(
  strategy: BotStrategy<TView, TAction>,
  delayMs: number = DEFAULT_THINKING_DELAY_MS,
  sleep: Sleep = realSleep,
): BotStrategy<TView, TAction> {
  return {
    async chooseAction(view, legalActions, budgetMs, answer) {
      const [action] = await Promise.all([Promise.resolve(strategy.chooseAction(view, legalActions, budgetMs, answer)), sleep(delayMs)]);
      return action;
    },
  };
}
