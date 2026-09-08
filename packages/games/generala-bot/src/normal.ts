import type { GeneralaAction, PlayerView } from "@hexdev/generala-engine";
import { immediateValue, largestMatchingGroup, sacrificeRank } from "./heuristics.js";
import type { GeneralaTier, NonEmptyActions } from "./tier.js";

/**
 * design §D7, normal: "Greedy, no lookahead. Hold = largest matching group
 * (ties → higher face). Score = highest immediate value; when everything yields
 * 0, cross by a fixed `SACRIFICE_ORDER` constant."
 *
 * NO ENTROPY, AND THE SIGNATURE SAYS SO. `createEasyBot` takes an `rng` and
 * genuinely consults it, because uniform choice is the whole of that tier.
 * This one is a total function of the position, so it takes no source at all —
 * a parameter it never read would be a claim that it might. `createBotStrategy`
 * still hands `rng` to the tiers that want one, which is `truco-bot`'s own
 * shape (`index.ts:25`, where `createEasyBot()` takes none while
 * `createNormalBot(rng)` does): the seam a caller programs against is
 * `createBotStrategy(tier, rng)`, and the branch behind it is nobody else's
 * business.
 *
 * Determinism is worth more here than it looks. `match-room.ts:315-318`
 * constructs ONE strategy per room and reuses it for every seat, so a tier that
 * drifted with a source would answer the same position differently depending on
 * how many decisions had come before it.
 *
 * THE POLICY IS DELIBERATELY WEAK. With throws remaining it keeps the largest
 * matching group and re-rolls the rest, which means it will break a made
 * escalera or full to chase a bigger group — an escalera servida on the opening
 * throw is worth 25 and this tier throws four of its five dice away rather than
 * write it. That is what "no lookahead" costs: valuing a re-roll against a
 * made hand requires knowing what the re-roll is likely to produce, which is
 * exactly the enumeration D7 reserves for `hard`. Making normal stop on a made
 * hand would need a stopping threshold nothing in the design states, and would
 * leave slice 17 with nothing to be better than.
 */
export function createNormalBot(): GeneralaTier {
  return {
    chooseAction(view, legalActions) {
      // `??` twice, and the second one is `easy.ts`'s own fall-back argument:
      // `bestScore` can only answer `null` if a `deciding` list arrived with no
      // score action on it, which the engine's invariant makes unreachable
      // (`legal-actions.ts`: a seat only reaches `deciding` with an open box).
      // If it ever does, this still returns a move the room will admit rather
      // than `undefined`, which it would not.
      return bestHold(view, legalActions) ?? bestScore(view, legalActions) ?? legalActions[0];
    },
  };
}

/**
 * The hold to make, or `null` when the game is not offering one.
 *
 * THE WHOLE ARBITRATION IS THIS LOOKUP, and that is a stronger statement than
 * the first draft made. It began with an explicit `group.indices.length === 5`
 * guard beside the search, on the reasoning that five of a kind has nothing to
 * keep. Deleting that guard left the entire suite green, and the reason is
 * structural rather than lucky: a keep of all five re-rolls nothing, so the
 * engine does not offer one at all (`legal-actions.ts`: 31 holds, never 32) and
 * the search simply finds nothing. Two mechanisms were doing one job and
 * NEITHER was individually observable — a second mutation, making the search
 * fall back to any hold, was also green because the guard short-circuited it
 * first. One mechanism was kept, and it is the one the engine's own offer list
 * enforces; the fall-back mutation reds it now.
 *
 * The third throw arrives at the same answer by the same route: the list stops
 * carrying holds once `rollsUsed` reaches `ROLLS_PER_TURN`, so there is nothing
 * to find. Both of D7's "now score" cases are one case.
 *
 * That arbitration is the one piece D7's table does not spell out, and it is
 * read off the rules rather than chosen — every other reading needs a stopping
 * rule the design does not state. See the tier's own docstring above.
 *
 * The action is FOUND in the offered list, never built. `sameAction`
 * (`match-room.ts:220-232`) walks `keep` by index, so a hold this bot assembled
 * would be unsubmittable however equal it looked; the search is by value and
 * the return is by identity. The compiler holds half of that on its own — a
 * `GeneralaAction` is a union, so a rebuild cannot even read `keep` without
 * narrowing first.
 */
function bestHold(view: PlayerView, legalActions: NonEmptyActions): GeneralaAction | null {
  const turn = view.turn;
  if (turn.phase !== "deciding") return null;

  const group = largestMatchingGroup(turn.dice);
  return legalActions.find((action) => action.type === "hold" && sameIndices(action.keep, group.indices)) ?? null;
}

/**
 * DECLARED UNCOVERED, deliberately (archive §6, rung 4).
 *
 * Both arrays are strictly ascending by construction — `KEEP_SETS`'s walk only
 * ever appends a higher index, and `largestMatchingGroup` collects positions in
 * order — so a set comparison and this ordered walk agree on every input that
 * can reach them. Rewriting it as `right.includes(index)` is green, and it is
 * green honestly: no unordered input exists.
 *
 * It stays a walk anyway, because the ordering is what makes the answer
 * submittable at all: the room's comparator makes `[1,0]` and `[0,1]` different
 * actions. The fence that IS load-bearing sits upstream, where
 * `heuristics.test.ts` asserts the indices come out ascending — reversing them
 * there reds ten tests across all three files.
 */
function sameIndices(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((index, position) => index === right[position]);
}

/**
 * The box to write: the highest immediate value, with `SACRIFICE_ORDER` breaking
 * every tie.
 *
 * CROSSING OUT IS NOT A CASE HERE, and that is the point. D7 asks for the
 * highest value and, "when everything yields 0", a fixed sacrifice order. Those
 * are the same rule: every open box worth nothing is just the tie that happens
 * at zero, and the ruleset's own generalisation says so — every open category is
 * a legal target evaluating to whatever it yields, "así 'tachar' deja de ser un
 * tipo de acción". One comparison instead of two branches that could disagree
 * about which box a seat gives up.
 *
 * `>` on the value and `<` on the rank, both strict, so the FIRST action to
 * reach a given (value, rank) pair keeps it. Only one action can: a box appears
 * at most once in an offer list, and each box has one rank.
 */
function bestScore(view: PlayerView, legalActions: NonEmptyActions): GeneralaAction | null {
  let best: GeneralaAction | null = null;
  let bestValue = -1;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const action of legalActions) {
    if (action.type !== "score") continue;
    const value = immediateValue(view, action.category);
    const rank = sacrificeRank(action.category);
    if (value > bestValue || (value === bestValue && rank < bestRank)) {
      best = action;
      bestValue = value;
      bestRank = rank;
    }
  }

  return best;
}
