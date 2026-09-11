import type { RandomSource } from "@hexdev/platform-contract";
import type { MentirosoAction, PlayerView } from "@hexdev/mentiroso-engine";
import { DIE_FACE_PROBABILITY } from "./probability.js";
import { chooseModulatedMentirosoAction, chooseUniformRaise } from "./normal.js";
import type { RaiseAction } from "./normal.js";
import type { MentirosoTier, NonEmptyActions } from "./tier.js";

/**
 * `easy` (SDD `mentiroso`, work unit D3/task 4.3, design D7's own title:
 * "not three algorithms — ONE evaluation and TWO layers of modulation").
 *
 * `chooseModulatedMentirosoAction` (`normal.ts`) already owns the ONE
 * evaluation every tier ships against: the ceiling gate (mentiroso-rules
 * R-CEILING), the phase guard, and `probabilityBidHolds` itself. This file
 * supplies ONLY the two modulation hooks design D7 names for this tier —
 * nothing here re-derives the ceiling check, the phase guard, or the
 * probability formula. If a future change to this file starts looking like
 * a second copy of that machinery, that is a signal to stop and say so, not
 * to keep going.
 *
 * `sdd/mentiroso/research` (#4086, C14) is explicit that no
 * Liar's-Dice-specific easy/normal/hard cut exists in the literature at any
 * probability convention — the only sourced pattern is generic dynamic
 * difficulty: "keep ONE underlying evaluation and vary a threshold/noise
 * layer per tier". Both constants below are this file's own house decision,
 * exactly as that pattern predicts, not a number pulled from any source.
 *
 * THIS TIER CONSUMES RNG — design's own launch instruction: "easy is the
 * only level that can consume randomness"; `normal` and `hard` stay
 * deterministic functions of the position. `probabilityBidHolds` itself
 * never changes: only the estimate the coin flip compares against, and the
 * raise chosen once continuing, are noised/biased here.
 */

/**
 * How far the noised estimate may drift from the honest one, in either
 * direction (never a literature-sourced figure — see this file's own top
 * docblock). `rng()` is `[0, 1)` (`platform-contract`'s own `RandomSource`
 * contract), so `(rng() - 0.5) * 2` spans `(-1, 1]` uniformly, scaled by this
 * constant: the noised estimate can land anywhere in
 * `[honestEstimate - 0.3, honestEstimate + 0.3]`.
 *
 * NO CLAMPING TO `[0, 1]` — deliberately, not an oversight. The coin flip
 * this feeds (`normal.ts`'s own `chooseModulatedMentirosoAction`) is
 * `rng() >= estimate`, and `rng()` never reaches `1` (the same `[0, 1)`
 * contract). An estimate at or below `0` is therefore ALREADY "always
 * doubt" and an estimate at or above `1` is ALREADY "never doubt" — exactly
 * the correct reading at either extreme — so clamping would change no
 * observable decision, only the (otherwise unread) numeric value itself.
 * `easy.test.ts` proves both extremes still answer correctly WITHOUT a
 * clamp, rather than adding one this file could not actually prove matters.
 */
const ESTIMATE_NOISE_MAGNITUDE = 0.3;

/**
 * How often, once continuing, this tier raises by the smallest legal amount
 * instead of falling back to `normal`'s own uniform pick (design D7: "a bias
 * toward the minimal raise") — again a house decision, not a sourced number.
 */
const MINIMAL_RAISE_BIAS_RATE = 0.7;

/**
 * Layer 1 (design D7): additive noise on the honest estimate. See
 * `ESTIMATE_NOISE_MAGNITUDE` above for why this is deliberately unclamped.
 */
function noiseEstimate(honestEstimate: number, rng: RandomSource): number {
  return honestEstimate + (rng() - 0.5) * 2 * ESTIMATE_NOISE_MAGNITUDE;
}

/**
 * Layer 2 (design D7): mostly the minimal legal raise — `raises[0]`, the
 * smallest strictly-greater bid `raisesFrom` (`mentiroso-engine/src/bids.ts`)
 * produces, since `getLegalActions` preserves that ascending order verbatim
 * into the offered action list this tier receives. Falls back to `normal`'s
 * own `chooseUniformRaise` — never a second uniform-pick implementation —
 * the rest of the time, so this tier is not perfectly predictable either.
 *
 * `raises` is non-empty whenever this is called (`chooseModulatedMentirosoAction`
 * only calls `selectRaise` after its own `raises.length === 0` early return),
 * but the type here is not a tuple, so the `undefined` branch below is
 * unreachable dead code, defensive rather than load-bearing — the same
 * "unreachable, pinned by test" style `truco-bot`'s own easy tier documents
 * for its own final fallback.
 */
function selectRaiseWithMinimalBias(raises: readonly RaiseAction[], rng: RandomSource): MentirosoAction {
  if (rng() < MINIMAL_RAISE_BIAS_RATE) {
    const minimal = raises[0];
    if (minimal !== undefined) return minimal;
  }
  return chooseUniformRaise(raises, rng);
}

/**
 * The decision itself, `p` explicit for the same reason `normal.ts` keeps it
 * explicit one level down (task 4.1/4.2's own p=1/6-vs-1/3 decision-level
 * fence — `easy.test.ts` reuses the identical fixture shape to confirm this
 * tier honors it too, rather than assuming the shared core carries it over
 * unverified).
 */
export function chooseEasyMentirosoAction(view: PlayerView, legalActions: NonEmptyActions, p: number, rng: RandomSource): MentirosoAction {
  return chooseModulatedMentirosoAction(view, legalActions, p, rng, noiseEstimate, selectRaiseWithMinimalBias);
}

/**
 * Wires the real `DIE_FACE_PROBABILITY` (1/6, no wildcards — task 4.1) into
 * `chooseEasyMentirosoAction` above, the same wiring discipline
 * `createNormalBot` already follows one file over.
 */
export function createEasyBot(rng: RandomSource): MentirosoTier {
  return {
    chooseAction(view, legalActions) {
      return chooseEasyMentirosoAction(view, legalActions, DIE_FACE_PROBABILITY, rng);
    },
  };
}
