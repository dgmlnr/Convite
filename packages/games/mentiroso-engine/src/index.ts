/**
 * `mentiroso-engine`'s public barrel (SDD `mentiroso`, work unit B5/task
 * 2.5) — the FIRST export surface this package has, matching its own
 * `package.json`'s `exports["."]` (`./dist/index.d.ts` / `./dist/index.js`),
 * unreachable by anything outside this package until this file exists.
 *
 * `fixtures.ts` is DELIBERATELY NOT re-exported here (design's own File
 * Changes table: "fixtures.ts (never barrelled)") — it is test data for this
 * package's own tests, not part of this package's public API.
 */
export type { Bid, DieFace, MatchState, Phase, Player, PlayerId } from "./state.js";
export { createMatch, MAX_SEAT_COUNT, MIN_SEAT_COUNT, STARTING_DICE_PER_SEAT } from "./state.js";
export { DIE_FACES } from "./dice.js";
export { nextActiveSeat, previousActiveSeat } from "./seating.js";
export { ceilingFor, raisesFrom, totalDice } from "./bids.js";
export type { MentirosoAction } from "./legal-actions.js";
export { getLegalActions } from "./legal-actions.js";
export type { ApplyResult, RuleViolation } from "./violation.js";
export { reject } from "./violation.js";
export { applyOpeningDrawRoll, applyRaise } from "./apply.js";
export { applyDoubt, resolveShowdown, tallyFace } from "./showdown.js";
export type { MatchOutcome } from "./outcome.js";
export { getOutcome } from "./outcome.js";
export type { PlayerView, RevealedRivalView, RivalView, SelfView } from "./view.js";
export { getViewFor, secretsFor } from "./view.js";
