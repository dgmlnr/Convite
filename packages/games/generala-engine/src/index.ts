/**
 * THE ENGINE'S WHOLE SURFACE, and no longer a partial one.
 *
 * Generala's rules landed over five slices and this file grew with them; with
 * `getViewFor` here, everything `generala-module` needs to satisfy
 * `platform-contract`'s port is exported and nothing is deliberately withheld.
 *
 * `SERVIDA_ROLL` IS API AND THE PREDICATES ARE NOT, which is the same line
 * drawn twice. How a box is VALUED is the engine's arithmetic; WHICH THROW is
 * servida is a rule a player is told, and `generala-ui` names it on screen.
 * A consumer that could not read it would type its own `1` beside the one
 * `scoreFor` reads — two sources of truth about one rule, both looking right.
 *
 * WHAT IS DELIBERATELY NOT HERE is the arithmetic behind the exports rather
 * than the exports themselves: `scoring.ts`'s eleven predicates (only `scoreFor`
 * is API — how a box is valued is not), `outcome.ts`'s `totalFor` (the view
 * carries the totals already derived, and exporting the function invites a
 * consumer to re-derive them), and `legal-actions.ts`'s `KEEP_SETS` (the offer
 * list IS the answer to what a hold may carry).
 */
export type { Dice, DieFace } from "./dice.js";
export { DICE_COUNT, DIE_FACES } from "./dice.js";
export type { PlayerId } from "./ids.js";
export type { CategoryId, MatchState, Scorecard, Turn } from "./state.js";
export { CATEGORY_IDS, ROLLS_PER_TURN, createMatch } from "./state.js";
export type { DieCounts } from "./scoring.js";
export { counts, scoreFor, SERVIDA_ROLL } from "./scoring.js";
export type { ApplyResult, RuleViolation } from "./violation.js";
export { applyRoll } from "./roll.js";
export type { GeneralaAction } from "./legal-actions.js";
export { getLegalActions } from "./legal-actions.js";
export type { HoldAction, ScoreAction } from "./play.js";
export { applyHold, applyPlayerAction, applyScore } from "./play.js";
export type { MatchOutcome } from "./outcome.js";
export { getOutcome } from "./outcome.js";
export type { PlayerView, SeatView } from "./view.js";
export { getViewFor } from "./view.js";
