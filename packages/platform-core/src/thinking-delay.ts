import type { BotStrategy } from "@hexdev/platform-contract";

export type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps ANY `BotStrategy` with a deliberate presentation pause — SEPARATE
 * from the strategy itself (design §9 / spec: "lives in the controller
 * wrapper, not the strategy, so strategy unit tests stay instant"). `sleep`
 * is injected (default: a real `setTimeout`) purely so this wrapper's own
 * tests never need to wait in real time, mirroring this project's
 * established Clock-injection discipline (`createRateLimiter`,
 * `createPresenceSweeper`).
 *
 * Runs the strategy and the delay CONCURRENTLY (`Promise.all`), so total
 * latency is `max(strategyTime, delayMs)`, never their sum — a slow
 * hard-tier search never stacks extra wait time on top of the presentation
 * pause.
 *
 * A strategy that THROWS keeps throwing through this wrapper. This is a
 * presentation pause, not a guard: swallowing the exception here would
 * silently undo whatever invariant guard the wrapped strategy relies on
 * (e.g. an empty-legal-actions check), one layer up, without changing a
 * line of that guard itself.
 *
 * FORMERLY THREE NEAR-IDENTICAL COPIES — `truco-bot`, `escoba-bot` and
 * `generala-bot` each had their own `latency.ts` with this exact function.
 * `escoba-bot`'s own docblock declared hoisting this a non-goal until a
 * THIRD game needed it; `generala-bot` was that third game, and its own
 * docblock named the extraction as an open item rather than doing it
 * quietly inside a bot-focused slice. This module is that item, done on its
 * own. Each bot's own `latency.ts` now just re-exports this function and
 * keeps its own `DEFAULT_THINKING_DELAY_MS` (and, for truco,
 * `SPOKEN_MOVE_DELAY_MS`) — those per-game numbers, and their own reasoning,
 * did NOT move here; see below for why.
 */
export function withThinkingDelay<TView, TAction>(
  strategy: BotStrategy<TView, TAction>,
  /**
   * REQUIRED, with no default — deliberately. Before this extraction, each
   * copy of this function defaulted `delayMs` to that FILE's own constant
   * (truco/escoba: 2400ms, generala: 600ms). Now that one function serves
   * three games with three different numbers, it cannot default to any one
   * of them without silently favoring that game's product decision over the
   * other two — exactly the mistake this extraction must not reintroduce.
   * Every real call site already passes its own constant explicitly (each
   * `*-module`'s `createBot`), so requiring it here breaks nothing in
   * production; it only removes the "defaults to X when undefined is
   * passed" test case each bot used to carry, which no longer describes any
   * real behaviour.
   */
  delayMs: number,
  sleep: Sleep = realSleep,
  /**
   * The TOTAL pause for a specific chosen action, when this kind of move
   * deserves more room than the default. `delayMs` is the floor: a smaller
   * number here is ignored rather than honoured, so this can only ever slow
   * a move down, never sneak one through faster than the base pause.
   *
   * Optional because it is game knowledge: this module has no opinion about
   * which of a game's moves are spoken and which are played. `truco-module`
   * supplies that when it builds its bot.
   */
  delayForAction?: (action: TAction) => number,
): BotStrategy<TView, TAction> {
  return {
    async chooseAction(view, legalActions, budgetMs, answer) {
      // The base pause still runs CONCURRENTLY with the strategy, which is
      // the whole point of the original shape: total latency is
      // max(strategyTime, delayMs), never their sum. Only the top-up below
      // has to wait, because until the strategy answers there is no action
      // to classify.
      const [action] = await Promise.all([
        Promise.resolve(strategy.chooseAction(view, legalActions, budgetMs, answer)),
        sleep(delayMs),
      ]);
      const total = delayForAction?.(action) ?? delayMs;
      if (total > delayMs) await sleep(total - delayMs);
      return action;
    },
  };
}
