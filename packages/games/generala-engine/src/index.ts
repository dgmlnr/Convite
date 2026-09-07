/**
 * PARTIAL BARREL. Generala's rules land over several slices, and this file grows
 * with them: the scoring table, the roll reducer, the legal-action enumeration,
 * `getOutcome` and `getViewFor` are not here yet and their absence is the plan,
 * not an omission. Nothing outside this package imports it until the module
 * exists, so an incomplete surface breaks nobody.
 */
export type { Dice, DieFace } from "./dice.js";
export { DIE_FACES } from "./dice.js";
export type { PlayerId } from "./ids.js";
export type { CategoryId, MatchState, Scorecard, Turn } from "./state.js";
export { CATEGORY_IDS, createMatch } from "./state.js";
export type { DieCounts } from "./scoring.js";
export { counts, scoreFor } from "./scoring.js";
export type { ApplyResult, RuleViolation } from "./roll.js";
export { applyRoll } from "./roll.js";
