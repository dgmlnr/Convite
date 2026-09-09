import type { BotStrategy } from "@hexdev/platform-contract";

/**
 * Generala's OWN latency module, and the third copy of this file in the repo.
 *
 * `withThinkingDelay` already exists in `truco-bot/src/latency.ts` and again in
 * `escoba-bot/src/latency.ts`, and importing either would make `generala-bot`
 * depend on another game's bot — the same argument
 * `l0-spanish-deck-ui-no-workspace-deps`'s own comment makes for shared card
 * art. `escoba-bot` recorded the other half of the decision when it made the
 * second copy: hoisting this to `platform-core` is a shared-abstraction
 * extraction, and that was declared a non-goal until a THIRD game needed one.
 * This is that third game, so the extraction is now arguable — and it is
 * deliberately NOT done here, because it would put a change to `platform-core`
 * inside a slice whose subject is a bot. Named as an open item rather than
 * taken quietly.
 *
 * Like escoba and unlike truco, Generala needs only ONE pause: it has no spoken
 * move. A hold moves dice into their own row and a score writes a number into a
 * box; both are self-evident the instant they land, and neither is a transient
 * claim that has to be read before it disappears.
 */

/**
 * 600 ms — a QUARTER of escoba's and truco's 2400, and the number is the
 * decision rather than a ratio: see the measurement below.
 *
 * Those two numbers were set by what a player has to READ during the pause: the
 * pause happens BEFORE a bot's own move lands, so it protects whatever the
 * PREVIOUS move put on screen. Truco measured its 2400 against a 2000 ms
 * per-seat call chip; escoba copied it for a table it shares with one decision
 * per turn.
 *
 * A GENERALA TURN CONTAINS THREE BOT DECISIONS, NOT ONE, and each of them is
 * already separated from the previous one by two pauses this module does not
 * own: the registration's `systemActionPauseMs` before the cup is thrown, and
 * the toss animation itself. The reading window escoba's 2400 had to provide
 * alone is here provided partly by the roll, so a full 2400 on top of it would
 * make one bot turn take upwards of ten seconds and an eleven-round match a
 * study in patience.
 *
 * MEASURED, AND THEN DECIDED — spec open input O-3, closed. The `hard` tier's
 * slowest decision over a whole self-played match is **8.87 ms**, mean 1.60 ms.
 * So the previous 1200 was 135 times the work it was hiding, and this pause is
 * not latency cover at all: it is entirely presentation, which is the only
 * honest basis on which to choose it.
 *
 * The product owner chose 600: fast enough that a player is not waiting, slow
 * enough that the opponent does not answer like a reflex. The arithmetic that
 * made it a real question rather than a preference — a bot turn is up to four
 * decisions (three holds and a score), so at 1200 one turn cost 4.8 s and an
 * eleven-round match spent close to a minute on deliberate waiting alone. At
 * 600 that turn is 2.4 s and the match's waiting roughly halves.
 *
 * NOT LOWER, deliberately. Below about 250 ms the answer starts reading as
 * instantaneous, and an opponent that never hesitates stops feeling like an
 * opponent. The floor here is perceptual, not technical: the decision itself
 * has been ready for 591 of those 600 milliseconds.
 *
 * The coupling to `systemActionPauseMs` is real and cannot be expressed in code
 * from here: that value lives on the registration (`apps/server/src/registry.ts`,
 * slice 18) and a bot has no business importing a composition root. If either
 * number moves, the other has to be looked at — the same standing note
 * `truco-bot`'s own constant carries about `DEFAULT_SEAT_CALL_NOTICE_MS`.
 *
 * Tunable via the wrapper's own parameter; this is only the default.
 */
export const DEFAULT_THINKING_DELAY_MS = 600;

export type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps any `BotStrategy` with a deliberate pause, run CONCURRENTLY with the
 * strategy (`Promise.all`) so total latency is `max(strategyTime, delayMs)` and
 * never their sum. That matters more here than it did for escoba: slice 17's
 * hard tier runs an exact one-ply enumeration over multisets, and stacking the
 * presentation pause on top of a real search would show up as a bot that thinks
 * visibly longer the better it plays.
 *
 * `sleep` is injected purely so this wrapper's own tests never wait in real
 * time — this project's established Clock-injection discipline, and the reason
 * `latency.test.ts` runs in milliseconds.
 *
 * A strategy that THROWS keeps throwing through this wrapper, which is
 * load-bearing: `createBotStrategy`'s empty-list guard is the only one in the
 * package, and a wrapper that swallowed it would undo task 8.4 one layer up
 * without changing a line of the guard itself.
 */
export function withThinkingDelay<TView, TAction>(strategy: BotStrategy<TView, TAction>, delayMs: number = DEFAULT_THINKING_DELAY_MS, sleep: Sleep = realSleep): BotStrategy<TView, TAction> {
  return {
    async chooseAction(view, legalActions, budgetMs, answer) {
      const [action] = await Promise.all([Promise.resolve(strategy.chooseAction(view, legalActions, budgetMs, answer)), sleep(delayMs)]);
      return action;
    },
  };
}
