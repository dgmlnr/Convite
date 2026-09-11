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
 * silent on entirely (C5 only addresses doubting). Picking uniformly among
 * the legal raises is this file's own undecorated default — no bias toward
 * the minimal one, which is `easy`'s own declared differentiator (design
 * D7), and no lookahead, which is `hard`'s.
 *
 * THIS TIER SEES ONLY `PlayerView` — never `MatchState` — the exact
 * information a human sitting in this seat would have. `PlayerView.rivals`
 * carries `diceCount`, never a rival's actual faces outside `showdown`
 * (`mentiroso-engine/src/view.ts`'s own `RivalView`), so there is no field
 * this file COULD read to cheat even if it wanted to — the same
 * "unrepresentable at the type level" guarantee `platform-contract`'s own
 * `BotStrategy` docblock states for every bot in this repo.
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

function isRaise(action: MentirosoAction): action is Extract<MentirosoAction, { type: "raise" }> {
  return action.type === "raise";
}

function isDoubt(action: MentirosoAction): action is Extract<MentirosoAction, { type: "doubt" }> {
  return action.type === "doubt";
}

/**
 * The decision itself, with `p` as an explicit argument (see
 * `probabilityBidHolds` above for why). `createNormalBot` below is the only
 * production caller, and it always hands in the real `DIE_FACE_PROBABILITY`.
 *
 * THE CEILING IS CHECKED FIRST, AHEAD OF ANY PROBABILITY (mentiroso-rules
 * R-CEILING): when no raise is legal, `doubt` is returned outright, without
 * ever consulting `rng` or `probabilityBidHolds` — the ceiling forces this
 * regardless of how likely the bid looks, which is exactly why this branch
 * is checked BEFORE the coin flip rather than folded into it.
 *
 * THE COIN FLIP: `rng() < P(bid holds)` means "the draw landed inside the
 * region judged to make the bid true" -> continue (raise); otherwise ->
 * doubt. This is the probability-PROPORTIONAL choice research C5 describes:
 * a bid judged 90% likely true is doubted only on the unlucky 10% of draws,
 * never on a fixed 50% cutoff.
 */
export function chooseMentirosoAction(view: PlayerView, legalActions: NonEmptyActions, p: number, rng: RandomSource): MentirosoAction {
  const raises = legalActions.filter(isRaise);
  const doubtAction = legalActions.find(isDoubt);

  if (raises.length === 0) {
    return doubtAction ?? legalActions[0];
  }

  if (doubtAction !== undefined) {
    if (view.phase.kind !== "bidding" || view.phase.bid === null) {
      throw new Error("mentiroso-bot: doubt was offered outside an active bid -- this should be unreachable through the engine's own getLegalActions");
    }
    if (rng() >= probabilityBidHolds(view, view.phase.bid, p)) return doubtAction;
  }

  const index = Math.floor(rng() * raises.length);
  return raises[index] ?? raises[0];
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
