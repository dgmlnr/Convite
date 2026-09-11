import type { RandomSource } from "@hexdev/platform-contract";
import type { Bid, MentirosoAction, PlayerView } from "@hexdev/mentiroso-engine";
import { atLeast, DIE_FACE_PROBABILITY } from "./probability.js";
import type { MentirosoTier, NonEmptyActions } from "./tier.js";

/**
 * `normal` (SDD `mentiroso`, work unit D2/task 4.2, design D7): the honest
 * evaluation, with a probability-proportional stochastic choice for the ONE
 * decision the literature actually describes — whether to doubt at all.
 *
 * `sdd/mentiroso/research` (#4086, C5): "no general mid-game doubt threshold
 * exists, under either p... community implementations use a
 * probability-proportional stochastic choice instead of a fixed cutoff."
 * THIS IS A HOUSE DECISION, DECLARED AS ONE, NOT A SOURCED RESULT: research
 * names the SHAPE (proportional sampling over a fixed cutoff) but no source
 * gives an algorithm, so the exact mechanism below — sample a coin weighted
 * by `P(bid holds)` — is this file's own choice, not a result imported from
 * anywhere. `easy.ts` (task 4.3) reuses this same evaluation with added
 * noise and a raise bias; `hard.ts` (task 4.4) replaces it with a
 * determinized lookahead. Nothing here invents the doubt-vs-raise cutoff the
 * task brief warns against, because there IS no cutoff — only a probability.
 *
 * WHICH RAISE TO MAKE, once continuing, is a SEPARATE question research is
 * silent on entirely (C5 only addresses doubting). THIS FILE'S OWN POLICY
 * CHANGED IN TASK 4.6: it USED to pick uniformly among the legal raises
 * (`chooseUniformRaise` below, kept only as `easy.ts`'s own fallback now);
 * D4's seeded round-robin measured that uniform pick losing to `easy`'s own
 * minimal-raise habit 82.8% of the time (`sdd/mentiroso/apply-progress/stage-d`,
 * task 4.4's own "THE MEASUREMENT" — the product owner asked for a BETTER
 * `normal`, not merely one that wins). `selectSafestRaise` below is the
 * reasoned replacement: among the legal raises, pick whichever
 * `probabilityBidHolds` scores HIGHEST — the SAME closed-form evaluation the
 * coin flip already trusts, applied once per candidate, never a second
 * probability model and never a lookahead (`hard`'s own differentiator).
 *
 * THIS TIER SEES ONLY `PlayerView` — never `MatchState` — the exact
 * information a human sitting in this seat would have. `PlayerView.rivals`
 * carries `diceCount`, never a rival's actual faces outside `showdown`
 * (`mentiroso-engine/src/view.ts`'s own `RivalView`), so there is no field
 * this file COULD read to cheat even if it wanted to — the same
 * "unrepresentable at the type level" guarantee `platform-contract`'s own
 * `BotStrategy` docblock states for every bot in this repo.
 *
 * `chooseModulatedMentirosoAction` BELOW IS THE SHARED CORE (work unit
 * D3/task 4.3, design D7's own title: "not three algorithms — ONE
 * evaluation and TWO layers of modulation"). It lives in this file because
 * `normal` built it first, not because `normal` owns it: the ceiling gate,
 * the phase guard, and `probabilityBidHolds` itself are the ONE evaluation
 * every tier shares, and `modulateEstimate`/`selectRaise` are exactly the
 * two hooks a tier supplies instead of a second copy of that machinery.
 * `chooseMentirosoAction` is now a two-line caller of it (identity estimate,
 * uniform raise); `easy.ts` is the other caller (noise, minimal-raise bias).
 * This refactor changes no observable behavior of `chooseMentirosoAction` or
 * `createNormalBot` — this file's own pre-existing, UNMODIFIED test suite is
 * the approval test that proves it (strict TDD's own "approval testing"
 * discipline for refactoring already-shipped code).
 */

/**
 * `P(the bid holds)`, from the VIEWER'S OWN vantage (research C2): the
 * viewer's own matching dice are known constants, not random variables, so
 * they reduce the target BEFORE the tail runs, and the tail itself runs only
 * over dice this viewer genuinely cannot see — never the table's full count.
 *
 * `p` IS A PARAMETER, NEVER READ FROM `DIE_FACE_PROBABILITY` DIRECTLY inside
 * this function — the same discipline `atLeast` itself already enforces one
 * level down (task 4.1). This is what makes the decision-level fence in
 * `normal.test.ts` possible: a test can call `chooseMentirosoAction` with an
 * explicit `p` and observe the DECISION flip, independent of whatever the
 * production constant currently says.
 */
function probabilityBidHolds(view: PlayerView, bid: Bid, p: number): number {
  const ownMatching = view.self.dice.filter((face) => face === bid.face).length;
  const unseen = view.rivals.reduce((sum, rival) => sum + rival.diceCount, 0);
  return atLeast(bid.quantity - ownMatching, unseen, p);
}

/** Every raise action, narrowed once so `selectRaise` hooks (`normal`'s own
 * `chooseUniformRaise` below, `easy.ts`'s minimal-raise bias) never have to
 * re-derive this from a wider `MentirosoAction` union. */
export type RaiseAction = Extract<MentirosoAction, { type: "raise" }>;

function isRaise(action: MentirosoAction): action is RaiseAction {
  return action.type === "raise";
}

function isDoubt(action: MentirosoAction): action is Extract<MentirosoAction, { type: "doubt" }> {
  return action.type === "doubt";
}

/**
 * `normal`'s OLD raise choice (task 4.2) — extracted so `easy.ts` can fall
 * back to the SAME default once its own minimal-raise bias does not trigger,
 * instead of a second "pick uniformly" implementation in a sibling file.
 * Behavior is byte-identical to this file's pre-refactor inline version.
 *
 * `normal` ITSELF no longer calls this (task 4.6 — see `selectSafestRaise`
 * below and this file's own top docblock for why); kept exported, unchanged,
 * purely because `easy.ts` still depends on it.
 */
export function chooseUniformRaise(raises: readonly RaiseAction[], rng: RandomSource): MentirosoAction {
  const index = Math.floor(rng() * raises.length);
  return raises[index] ?? raises[0];
}

/**
 * `normal`'s OWN raise choice as of task 4.6 (product-owner request after
 * D4's round-robin measured `normal` losing to `easy` 82.8% of the time —
 * `sdd/mentiroso/apply-progress/stage-d`, task 4.4's own "THE MEASUREMENT").
 * See this file's own top docblock for the full argument; this docblock
 * covers only the mechanism.
 *
 * Scores every legal raise with `probabilityBidHolds` — the SAME closed-form
 * evaluation the coin flip above already trusts, applied once per candidate
 * — and returns whichever scores HIGHEST: the raise this seat is least
 * likely to later lose a showdown over.
 *
 * NOT "ALWAYS `raises[0]`" (the lexicographically minimal raise, `easy.ts`'s
 * own habitual pick). A legal raise may increase QUANTITY while DROPPING
 * face (mentiroso-rules: "increasing quantity permits any face, even a
 * lower one"), and this seat's OWN dice reduce each candidate's required
 * count differently PER FACE — a hand heavy in one face can make a
 * HIGHER-quantity, DIFFERENT-face raise strictly SAFER than the smallest
 * legal one. `normal.test.ts` pins a fixture where the two genuinely
 * disagree, deliberately avoiding the fixture shape where they would
 * coincide and prove nothing.
 *
 * DETERMINISTIC — no `rng` parameter at all. `normal`'s only remaining
 * randomness is the coin flip in `chooseModulatedMentirosoAction`, unchanged
 * by this unit. Ties (equal probability) resolve to whichever candidate
 * appears EARLIEST in `raises` — the same tie-break convention `hard.ts`'s
 * own `selectSafestRaise` already uses, so the two tiers' raise-selection
 * code cannot disagree about what "tied" means.
 */
export function selectSafestRaise(view: PlayerView, raises: readonly RaiseAction[], p: number): MentirosoAction {
  let bestIndex = 0;
  let bestProbability = probabilityBidHolds(view, raises[0]!.bid, p);
  for (let index = 1; index < raises.length; index += 1) {
    const candidateProbability = probabilityBidHolds(view, raises[index]!.bid, p);
    if (candidateProbability > bestProbability) {
      bestIndex = index;
      bestProbability = candidateProbability;
    }
  }
  return raises[bestIndex]!;
}

/**
 * The shared decision core every tier calls (see this file's own top
 * docblock). `p` is explicit for the same reason `probabilityBidHolds` keeps
 * it explicit one level down (task 4.1/4.2's own p=1/6-vs-1/3 decision-level
 * fence). `modulateEstimate` reshapes the honest `P(bid holds)` BEFORE the
 * coin flip (identity for `normal`, additive noise for `easy` — task 4.3);
 * `selectRaise` picks among the legal raises once continuing (highest
 * `probabilityBidHolds` for `normal`, task 4.6; biased toward the minimal
 * one for `easy`).
 *
 * THE CEILING IS CHECKED FIRST, AHEAD OF ANY PROBABILITY (mentiroso-rules
 * R-CEILING): when no raise is legal, `doubt` is returned outright, without
 * ever consulting `rng`, `probabilityBidHolds`, or `modulateEstimate` — the
 * ceiling forces this regardless of how likely the bid looks or how any
 * tier modulates that likelihood, which is exactly why this branch is
 * checked BEFORE the coin flip rather than folded into it. THIS GATE IS
 * SHARED, not duplicated per tier — a bug in it would otherwise have to be
 * fixed in as many places as there are tiers.
 *
 * THE COIN FLIP: `rng() < estimate` means "the draw landed inside the
 * region judged to make the bid true" -> continue (raise); otherwise ->
 * doubt. This is the probability-PROPORTIONAL choice research C5 describes:
 * a bid judged 90% likely true is doubted only on the unlucky 10% of draws,
 * never on a fixed 50% cutoff — whatever `modulateEstimate` reshaped "90%
 * likely" into.
 */
export function chooseModulatedMentirosoAction(
  view: PlayerView,
  legalActions: NonEmptyActions,
  p: number,
  rng: RandomSource,
  modulateEstimate: (honestEstimate: number, rng: RandomSource) => number,
  selectRaise: (raises: readonly RaiseAction[], rng: RandomSource) => MentirosoAction,
): MentirosoAction {
  const raises = legalActions.filter(isRaise);
  const doubtAction = legalActions.find(isDoubt);

  if (raises.length === 0) {
    return doubtAction ?? legalActions[0];
  }

  if (doubtAction !== undefined) {
    if (view.phase.kind !== "bidding" || view.phase.bid === null) {
      throw new Error("mentiroso-bot: doubt was offered outside an active bid -- this should be unreachable through the engine's own getLegalActions");
    }
    const estimate = modulateEstimate(probabilityBidHolds(view, view.phase.bid, p), rng);
    if (rng() >= estimate) return doubtAction;
  }

  return selectRaise(raises, rng);
}

/**
 * `normal`'s own entry point: the honest estimate, unmodulated, and (task
 * 4.6) the raise `selectSafestRaise` scores highest among the legal ones.
 * `createNormalBot` below is the only production caller, and it always hands
 * in the real `DIE_FACE_PROBABILITY`.
 */
export function chooseMentirosoAction(view: PlayerView, legalActions: NonEmptyActions, p: number, rng: RandomSource): MentirosoAction {
  return chooseModulatedMentirosoAction(view, legalActions, p, rng, (honestEstimate) => honestEstimate, (raises) => selectSafestRaise(view, raises, p));
}

/**
 * Wires the real `DIE_FACE_PROBABILITY` (1/6, no wildcards — task 4.1) into
 * `chooseMentirosoAction` above. This is the only place in this file that
 * reads the production constant; every decision itself lives in the function
 * it wraps.
 */
export function createNormalBot(rng: RandomSource): MentirosoTier {
  return {
    chooseAction(view, legalActions) {
      return chooseMentirosoAction(view, legalActions, DIE_FACE_PROBABILITY, rng);
    },
  };
}
