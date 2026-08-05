import type { TrucoCallLevel } from "./match.js";

/**
 * Standard Truco Argentino hand-value convention — INFERENCE, not literal
 * spec text (the spec never states numeric points for truco levels anywhere).
 * Single-sourced here so `truco-chain.ts`'s decline value and `card-play.ts`'s
 * accepted-hand value can never silently drift apart. Both modules import
 * from this file instead of from each other, which avoids the
 * `truco-chain.ts` <-> `card-play.ts` import cycle that a direct cross-import
 * would create (`truco-chain.ts` must import FROM `card-play.ts` to merge
 * card play into the top-level reducer).
 */

/** Points conceded on a decline: the last ACCEPTED level's value, or the
 * base 1-point hand value for a first call. Escalation is strictly
 * sequential, so this is a static function of the declined level alone. */
export const DECLINE_VALUE: Record<TrucoCallLevel, number> = {
  truco: 1,
  retruco: 2,
  valeCuatro: 3,
};

/** Points awarded when a hand is decided by card play after this level was
 * ACCEPTED (never declined). One point higher than the same level's decline
 * value, matching the real-world scoring convention. */
export const ACCEPTED_HAND_VALUE: Record<TrucoCallLevel, number> = {
  truco: 2,
  retruco: 3,
  valeCuatro: 4,
};
