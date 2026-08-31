import { formatElapsed } from "./chronometer.js";

/**
 * WHAT THE BOARD SAYS WHEN IT ENDS — one sentence, in Spanish, and the rule
 * that picks it.
 *
 * Kept apart from the DOM that shows it for the same reason `chronometer.ts`
 * is: a sentence is a value, and a value can be fenced at its exact letters
 * in the node suite instead of being read back out of a rendered element.
 */

/**
 * Structurally identical to `platform-contract`'s `MatchOutcome`, and
 * deliberately NOT imported from it — `escoba-ui/match-outcome.ts` mirrors
 * the same shape and records the same reason: no `packages/games/*-ui`
 * package in this repository depends on the platform, and a game's
 * presentation layer is not the place to open that edge.
 *
 * A ONE-SEAT GAME MAKES THIS LIST A BOOLEAN IN PRACTICE. The engine's
 * `getOutcome` names the solo player when every tile has been removed, names
 * nobody when tiles remain and no free pair matches, and returns `null` while
 * the match is still live — so by the time a message is being written, "is
 * this list empty" is the whole question. There is no `selfPlayerId`
 * parameter for the same reason there is no opponent.
 */
export interface MahjongOutcomeInfo {
  readonly winnerIds: readonly string[];
}

export interface MahjongMatchOverProps {
  readonly outcome: MahjongOutcomeInfo;
  /**
   * How long the board took, or `null` when there is no honest figure to
   * report. `null` is what a RESUMED match produces: `createChronometer`
   * returns no chronometer at all on that path, so the caller has nothing to
   * pass — the absence is structural rather than a flag somebody has to
   * remember to set.
   */
  readonly elapsedMs: number | null;
}

/**
 * THE DEADLOCK SENTENCE, WORD FOR WORD.
 *
 * Pinned in the change's own artifacts and reproduced here exactly. It is one
 * of the few pieces of copy in this repository that is specified rather than
 * chosen, so it is a named constant: a rewording is then a diff on this line
 * rather than a diff inside a template.
 */
export const MAHJONG_DEADLOCK_MESSAGE = "Te quedaste sin pares. Siempre hay una salida — probá otro.";

/** The board came off, and there is a figure that honestly describes how long
 * that took. */
const clearedInMessage = (elapsedMs: number): string => `Lo resolviste en ${formatElapsed(elapsedMs)}.`;

/**
 * The board came off on a match this page session did not start, so there is
 * no figure. THE SAME SENTENCE MINUS THE NUMBER — same verb, same tone, no
 * apology and no asterisk. The alternative the spec also allows, a figure
 * "explicitly marked as partial", was rejected in design D4: a partial
 * readout is the same dishonesty in a quieter voice, and it costs a second
 * piece of copy, a second state, and a second thing to get wrong.
 */
const CLEARED_MESSAGE = "Lo resolviste.";

/**
 * The one sentence this match ends on.
 *
 * A DEADLOCK NEVER CARRIES THE TIME, and this function refuses it rather than
 * trusting the caller not to offer one. Getting stuck is not an achievement
 * to timestamp: a player who ran out of pairs after eleven minutes is not
 * being told that they were eleven-minutes bad at it. The sentence offers
 * another board instead, which is the only thing that is actually true — a
 * generated turtle is always solvable, so there really is a way out of every
 * board this game deals, just not out of this one any more.
 *
 * The refusal is written as "ignore the argument" rather than "the caller
 * passes null", because a caller holding a live chronometer at the end of a
 * lost match is the ordinary case, not a mistake: the chronometer was started
 * when the match was entered and knows nothing about how it ended.
 */
export function mahjongMatchOverMessage(props: MahjongMatchOverProps): string {
  if (props.outcome.winnerIds.length === 0) return MAHJONG_DEADLOCK_MESSAGE;
  return props.elapsedMs === null ? CLEARED_MESSAGE : clearedInMessage(props.elapsedMs);
}
