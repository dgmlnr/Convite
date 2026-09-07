/**
 * PARTIAL BARREL. Generala's rules land over several slices, and this file grows
 * with them: `getViewFor` is not here yet and its absence is the plan, not an
 * omission. Nothing outside this package imports it until the module exists, so
 * an incomplete surface breaks nobody.
 *
 * The list of what is missing is kept CURRENT rather than left as it was
 * written: the scoring table, the roll reducer, the legal-action enumeration
 * and the outcome have all landed since, and a docstring naming them as absent
 * would be a statement in the shipped source that is simply false.
 */
export type { Dice, DieFace } from "./dice.js";
export { DICE_COUNT, DIE_FACES } from "./dice.js";
export type { PlayerId } from "./ids.js";
export type { CategoryId, MatchState, Scorecard, Turn } from "./state.js";
export { CATEGORY_IDS, ROLLS_PER_TURN, createMatch } from "./state.js";
export type { DieCounts } from "./scoring.js";
export { counts, scoreFor } from "./scoring.js";
export type { ApplyResult, RuleViolation } from "./violation.js";
export { applyRoll } from "./roll.js";
export type { GeneralaAction } from "./legal-actions.js";
export { getLegalActions } from "./legal-actions.js";
export type { HoldAction, ScoreAction } from "./play.js";
export { applyHold, applyPlayerAction, applyScore } from "./play.js";
export type { MatchOutcome } from "./outcome.js";
export { getOutcome } from "./outcome.js";
