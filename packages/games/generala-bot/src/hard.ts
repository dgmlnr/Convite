import { CATEGORY_IDS, DICE_COUNT, scoreFor } from "@hexdev/generala-engine";
import type { CategoryId, Dice, DieFace, GeneralaAction, PlayerView, Scorecard } from "@hexdev/generala-engine";
import { immediateValue, sacrificeRank } from "./heuristics.js";
import { orderedThrowCount, rollOutcomes } from "./outcomes.js";
import type { GeneralaTier, NonEmptyActions } from "./tier.js";

/**
 * design §D7, hard: "**Exact** one-ply EV + a hand-tuned category-preference
 * order for ties and scarce boxes."
 *
 * EXACT, NOT MONTE CARLO, and `outcomes.ts` is where that claim is checkable.
 * `truco-bot` samples with `determinize.ts` because its hidden state is cards
 * nobody has seen and the space of deals is enormous. Generala hides nothing
 * (D6) and the cup has a small closed set of outcomes, so sampling would be
 * approximating something that can simply be counted: 252 weighted rows for
 * five dice, 1682 across all 31 holds, against the 7776 ordered throws of five
 * dice alone.
 *
 * ONE PLY IS ONE PLY, AND IT IS A CHOICE WITH A COST. The value of a hold here
 * is what the seat gets if it throws once and then WRITES A BOX — the leaf is
 * not allowed to hold again. With two throws left that under-values holding,
 * because a real seat could keep going, so this tier is slightly biased toward
 * writing early. Two plies is 31 holds × 252 outcomes × 31 holds × 252
 * outcomes ≈ 61 million evaluations per decision, which is not a tier that
 * fits in `BOT_BUDGET_MS`; D7 asked for one ply and the arithmetic agrees with
 * it. Named rather than left for somebody to discover in a docstring-free hole.
 *
 * NOT A SOLVED-GAME TABLE (spec O-5). Nothing here is precomputed per position
 * and nothing claims optimality; it is one exact throw of lookahead over the
 * engine's own valuations, plus `SACRIFICE_ORDER` for the ties.
 *
 * NO ENTROPY, LIKE `normal`. Every value below is a function of the position,
 * so an `rng` parameter would be a claim that one might be read.
 * `createBotStrategy(tier, rng)` is still what a caller programs against, and
 * `match-room.ts:315-318` builds ONE strategy per room and reuses it for every
 * seat — a tier that drifted with a source would answer the same position
 * differently depending on how many decisions came before it.
 */
export function createHardBot(): GeneralaTier {
  return {
    chooseAction(view, legalActions) {
      return bestByValue(view, legalActions);
    },
  };
}

/**
 * A hold and a score are compared on ONE scale, in ONE loop, and that is the
 * whole arbitration.
 *
 * `normal.ts` had to decide separately when to stop holding and start writing,
 * because a greedy tier has no number that makes the two comparable — D7 does
 * not spell that arbitration out and slice 16 read it off the rules instead.
 * Here it falls out: both sides are measured in points this turn, so "keep the
 * biggest number" answers the question that tier had to answer with a rule.
 *
 * THE UNION IS WHAT MAKES THIS TOTAL. `GeneralaAction` has exactly two arms, so
 * a third one would fail to compile here rather than fall through to a default
 * nobody chose — the compile-time result slices 7, 8 and 16 each found in their
 * own guards, now holding this tier's exhaustiveness.
 *
 * THERE IS NO PHASE GUARD ON THIS LOOP, and what it does instead was MEASURED.
 * Both valuations already answer 0 off `deciding`, so the loop is total without
 * one — but it does not then fall through to its seed: everything ties at 0 and
 * `SACRIFICE_ORDER` breaks the tie, so the answer is the cheapest box offered.
 * A guard returning `legalActions[0]` would therefore be a DIFFERENT answer
 * rather than a redundant second mechanism, which is a better reason not to
 * carry one than "it would never fire". `hard.test.ts` pins that arm, and
 * pinning it is what stopped the redundancy claim from being written down as a
 * comment nobody could check — slice 16's own finding, one file over.
 */
function bestByValue(view: PlayerView, legalActions: NonEmptyActions): GeneralaAction {
  let best = legalActions[0];
  let bestValue = valueOf(view, best);
  let bestRank = rankOf(best);

  for (let index = 1; index < legalActions.length; index += 1) {
    const action = legalActions[index]!;
    const value = valueOf(view, action);
    const rank = rankOf(action);
    if (value > bestValue || (value === bestValue && rank < bestRank)) {
      best = action;
      bestValue = value;
      bestRank = rank;
    }
  }

  return best;
}

/** Points this turn: what the box pays now, or what one more throw is expected to be worth. */
function valueOf(view: PlayerView, action: GeneralaAction): number {
  return action.type === "score" ? immediateValue(view, action.category) : expectedValueOfHold(view, action.keep);
}

/**
 * Which of two equally-valued actions to prefer, cheapest first.
 *
 * `SACRIFICE_ORDER` is `heuristics.ts`'s hand-tuned ladder and it is consumed
 * rather than re-derived, for the reason that file states: two tiers with their
 * own opinion about which box a seat minds losing least would be two tiers
 * disagreeing about the RULES instead of about strategy. D7 asks this tier for
 * "a hand-tuned category-preference order for ties and scarce boxes" and the
 * ladder already is one.
 *
 * A HOLD RANKS BELOW EVERY BOX, so a score wins an exact tie. That case is
 * reachable: a position where every open box is worth 0 for every outcome of
 * every re-roll — the doble alone, with the generala box crossed at zero —
 * values holds and scores alike at 0, and writing the box ends the turn while
 * holding spends a throw to arrive at the same place. Ties BETWEEN holds fall
 * to the first the engine offered, which is honest: two holds with the same
 * expected value are equally good by the only measure this tier has, and
 * `KEEP_SETS` is a canonical order rather than an arbitrary one.
 */
function rankOf(action: GeneralaAction): number {
  return action.type === "score" ? sacrificeRank(action.category) : CATEGORY_IDS.length;
}

/**
 * What this hold is expected to be worth: throw the dice it does not keep, then
 * write the best box on whatever lands.
 *
 * THE SERVIDA BONUS IS ON EXACTLY ONE SIDE OF THIS COMPARISON, and it is not a
 * special case anybody wrote. The leaf is evaluated at `rollsUsed + 1`, which
 * is 2 at the earliest, and `scoreFor` pays the servida value only at
 * `SERVIDA_ROLL`. So a hold ALWAYS spends the bonus and a score at
 * `rollsUsed === 1` always keeps it — which is how five points can decide
 * between the same five dice on two different throws, and why this is the first
 * tier in the package through which the bonus is observable at all (slice 16
 * measured that a greedy tier cannot see it).
 *
 * The counter is PASSED to the engine rather than translated into "armada
 * here", for the reason `heuristics.ts` gives for `immediateValue`: a bot that
 * decided what servida means would be a second source of truth about the
 * ruleset, and the two would not disagree today.
 *
 * NORMALIZED BY `orderedThrowCount`, NEVER BY THE WEIGHTS IT JUST ADDED UP.
 * That is `outcomes.ts`'s argument and this is where it is spent: dividing by
 * the table's own total weight would make any enumeration — a short one, a
 * sampler's hundred draws — produce a confident average of the wrong
 * distribution.
 *
 * OFF-PHASE IT IS 0, not a throw. A tier is only ever asked where it has a
 * legal action and the only phase offering one is `deciding`, so this arm is
 * unreachable through the port — and an unreachable arm is not the place to put
 * the first throw the design spent three layers removing (D7).
 */
export function expectedValueOfHold(view: PlayerView, keep: readonly number[]): number {
  const turn = view.turn;
  if (turn.phase !== "deciding") return 0;

  const card = view.cards[view.self.seat]!;
  const open = CATEGORY_IDS.filter((category) => card[category] === null);
  const kept = keep.map((index) => turn.dice[index]).filter((face): face is DieFace => face !== undefined);
  const thrown = DICE_COUNT - kept.length;

  let weighted = 0;
  for (const outcome of rollOutcomes(thrown)) {
    weighted += outcome.weight * bestBoxValue(handOf(kept, outcome.faces), turn.rollsUsed + 1, card, open);
  }

  return weighted / orderedThrowCount(thrown);
}

/**
 * The five dice the leaf is scored on: what was kept, plus what landed.
 *
 * POSITION IS DROPPED HERE ON PURPOSE, and it is safe for exactly one reason —
 * `scoreFor` reads the dice through `counts()` and every one of the eleven
 * rules is a predicate over that tally, so `[6,6,6,6,2]` and `[2,6,6,6,6]` are
 * the same hand to every question asked below. That is also what makes the
 * multiset enumeration legitimate in the first place: if order could change a
 * score, 252 rows would not be enough and 7776 would be needed.
 *
 * The engine's own splice (`roll.ts`) keeps positions because a PLAYER can see
 * which die is which and a held die must be the same die afterwards. Nothing
 * here is shown to anybody; it is scored and discarded.
 */
function handOf(kept: readonly DieFace[], landed: readonly DieFace[]): Dice {
  const five: readonly DieFace[] = [...kept, ...landed];
  return [five[0]!, five[1]!, five[2]!, five[3]!, five[4]!];
}

/**
 * The best still-open box for these dice — the leaf valuation, and the one
 * place this tier decides what a position is worth.
 *
 * Zero is the floor rather than a sentinel: every category evaluates to
 * whatever its own rule yields, zero included (ruleset §Generalización de
 * scoring), so a hand worth nothing really is worth nothing and there is no
 * "no box" case to represent.
 */
function bestBoxValue(dice: Dice, rollsUsed: number, card: Scorecard, open: readonly CategoryId[]): number {
  let best = 0;
  for (const category of open) {
    const value = scoreFor(category, dice, rollsUsed, card);
    if (value > best) best = value;
  }
  return best;
}
