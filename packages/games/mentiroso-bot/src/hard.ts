import type { RandomSource } from "@hexdev/platform-contract";
import type { DieFace, MentirosoAction, PlayerView } from "@hexdev/mentiroso-engine";
import { DIE_FACE_PROBABILITY } from "./probability.js";
import { chooseModulatedMentirosoAction } from "./normal.js";
import type { RaiseAction } from "./normal.js";
import { determinizeRivalDice } from "./determinize.js";
import type { MentirosoTier, NonEmptyActions } from "./tier.js";

/**
 * `hard` (SDD `mentiroso`, work unit D4/task 4.4, design D7: "not three
 * algorithms — ONE evaluation and TWO layers of modulation").
 *
 * `chooseModulatedMentirosoAction` (`normal.ts`) already owns the ONE
 * evaluation every tier shares: the ceiling gate, the phase guard, and
 * `probabilityBidHolds` itself. This file supplies its own two hooks --
 * nothing here re-derives the ceiling check, the phase guard, or the
 * probability formula.
 *
 * MODULATE-ESTIMATE STAYS THE IDENTITY, THE SAME AS `normal` -- deliberately,
 * NOT a third distortion layer. `probabilityBidHolds`'s closed-form binomial
 * tail (task 4.1) is already the EXACT probability under this game's true
 * model (i.i.d. dice, uniform, with replacement); there is no analytic gain
 * from noising or Monte-Carlo-resampling that same number a second time --
 * doing so would only ADD sampling noise to an answer that was already exact.
 * `hard`'s entire edge over `normal` is therefore concentrated in WHICH RAISE
 * it makes once continuing, never in whether it doubts.
 *
 * SELECT-RAISE DETERMINIZES (design D7's own words: "`hard` determinizes").
 * Research C14 names only ONE sourced tier-differentiation pattern --
 * threshold/noise variation -- and `easy.ts` already spent that pattern on
 * the estimate. No source names a raise-SELECTION algorithm at all, so this
 * file's own choice below (favor the raise most often true across many
 * sampled boards, `determinize.ts`) is a HOUSE DECISION, declared as one,
 * not imported from anywhere -- the identical declared-not-sourced posture
 * `normal.ts`'s own uniform pick and `easy.ts`'s own minimal-raise bias
 * already state for their own raise choices.
 */

/** How many full boards to sample per raise decision -- a house constant,
 * not a sourced number (see this file's own top docblock). Large enough that
 * a raise made CERTAIN by the viewer's own dice (safety 1.0, no sampling
 * variance at all) is never edged out by sampling noise on a merely-likely
 * rival, small enough to stay far under the per-decision budget this file's
 * own performance test measures (`hard.test.ts`). */
const DETERMINIZATION_SAMPLES = 200;

/** A histogram of `dice`, keyed by face — built once per sampled board so
 * every candidate raise can be checked against it in O(1), rather than
 * re-scanning the whole board once per raise (this game's ceiling can offer
 * well over 100 raises at once, `bids.ts`'s own worst case). */
function faceHistogram(dice: readonly DieFace[]): Partial<Record<DieFace, number>> {
  const histogram: Partial<Record<DieFace, number>> = {};
  for (const face of dice) histogram[face] = (histogram[face] ?? 0) + 1;
  return histogram;
}

/**
 * Picks the raise most often TRUE across `DETERMINIZATION_SAMPLES`
 * independently sampled full boards (the viewer's own KNOWN dice, unchanged
 * every sample, plus a freshly determinized guess at every rival's hidden
 * dice, `determinize.ts`). Ties go to whichever candidate appears EARLIEST
 * in `raises` — the offered list's own order, never a face or quantity
 * comparison — so the result is deterministic under a fixed rng regardless
 * of how many candidates tie.
 *
 * A single offered raise short-circuits WITHOUT spending any entropy: there
 * is no choice to make, so sampling would only cost time for an answer
 * already forced (`hard.test.ts`'s own "spends no entropy" case).
 */
function selectSafestRaise(view: PlayerView, raises: readonly RaiseAction[], rng: RandomSource): MentirosoAction {
  if (raises.length === 1) return raises[0]!;

  const safetyHits = new Array<number>(raises.length).fill(0);
  for (let sample = 0; sample < DETERMINIZATION_SAMPLES; sample += 1) {
    const rivalDice = determinizeRivalDice(view, rng);
    const board: DieFace[] = [...view.self.dice];
    for (const dice of rivalDice) board.push(...dice);
    const histogram = faceHistogram(board);

    for (let index = 0; index < raises.length; index += 1) {
      const candidate = raises[index]!;
      if ((histogram[candidate.bid.face] ?? 0) >= candidate.bid.quantity) safetyHits[index] += 1;
    }
  }

  let bestIndex = 0;
  let bestHits = safetyHits[0]!;
  for (let index = 1; index < raises.length; index += 1) {
    if (safetyHits[index]! > bestHits) {
      bestIndex = index;
      bestHits = safetyHits[index]!;
    }
  }
  return raises[bestIndex]!;
}

/**
 * `hard`'s own entry point: the honest, unmodulated estimate (identical
 * doubt/continue gate to `normal`), and the determinized "safest raise"
 * selection above once continuing. `createHardBot` below is the only
 * production caller, and it always hands in the real `DIE_FACE_PROBABILITY`.
 */
export function chooseHardMentirosoAction(view: PlayerView, legalActions: NonEmptyActions, p: number, rng: RandomSource): MentirosoAction {
  return chooseModulatedMentirosoAction(
    view,
    legalActions,
    p,
    rng,
    (honestEstimate) => honestEstimate,
    (raises, raiseRng) => selectSafestRaise(view, raises, raiseRng),
  );
}

/**
 * Wires the real `DIE_FACE_PROBABILITY` (1/6, no wildcards — task 4.1) into
 * `chooseHardMentirosoAction` above, the same wiring discipline
 * `createNormalBot`/`createEasyBot` already follow one file over.
 */
export function createHardBot(rng: RandomSource): MentirosoTier {
  return {
    chooseAction(view, legalActions) {
      return chooseHardMentirosoAction(view, legalActions, DIE_FACE_PROBABILITY, rng);
    },
  };
}
