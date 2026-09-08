import { counts, scoreFor } from "@hexdev/generala-engine";
import type { CategoryId, Dice, DieFace, PlayerView } from "@hexdev/generala-engine";

/**
 * FACTS ABOUT A POSITION, NOT A POLICY OVER ONE — that is the line this file
 * draws, and it is what makes it shareable.
 *
 * `normal.ts` composes what is here into design D7's greedy policy; slice 17's
 * `hard.ts` will compose the same three things into an exact one-ply EV. Both
 * need to know which dice match, what a box pays right now, and which box a
 * seat minds losing least. Neither should have its own opinion about any of
 * those, because two opinions is how the tiers come to disagree about the rules
 * rather than about strategy — and strategy is the only thing a tier is allowed
 * to differ on.
 */

/** The face a group is made of, and where its dice are sitting. */
export interface MatchingGroup {
  readonly face: DieFace;
  /** Positions, strictly ascending — the order every `keep` the engine offers is in. */
  readonly indices: readonly number[];
}

/**
 * The biggest set of dice showing the same face, with a tie going to the higher
 * face — design D7's hold rule for the normal tier, stated once as arithmetic
 * about dice.
 *
 * POSITIONS, NEVER FACES, and the whole action union depends on it: `hold`
 * carries indices because two dice showing 4 are different physical dice and
 * "keep a 4" cannot say which (`legal-actions.ts`). The indices come out
 * ascending because the dice are walked in order, which is the same order every
 * `keep` in `KEEP_SETS` is built in — so the set this returns is findable in the
 * offer list by value, and the caller can hand back the object the engine
 * offered rather than one it rebuilt.
 *
 * TOTAL, WITH NO EMPTY ANSWER. `best` starts as the face on the first die
 * rather than as a sentinel, so it always names a face at least one die really
 * shows; five dice cannot fail to have a largest group. That is the same
 * discipline `easy.ts` follows for its own out-of-range case — a tier's path has
 * no throw on it (D7's second layer).
 */
export function largestMatchingGroup(dice: Dice): MatchingGroup {
  const tally = counts(dice);
  let best: DieFace = dice[0];
  for (const face of dice) {
    // `>` then `>` on the face: strictly-better size wins, and an equal size is
    // broken by the higher face. Written as one condition because a `>=` on the
    // size alone would silently make the LAST equal face win — which is the
    // higher face here only by accident of the dice order.
    if (tally[face] > tally[best] || (tally[face] === tally[best] && face > best)) best = face;
  }
  return { face: best, indices: dice.flatMap((face, index) => (face === best ? [index] : [])) };
}

/**
 * The eleven boxes ordered by how little a seat minds spending one, cheapest
 * first — design D7's "a fixed `SACRIFICE_ORDER` constant".
 *
 * HAND-PICKED, AND SAID SO. The ladder follows the approximate value of holding
 * a box open over three throws, but the arithmetic behind those approximations
 * is not carried here and it is not derived at runtime: this is the normal
 * tier, whose whole definition is "greedy, no lookahead", and a constant
 * computed from expected values would be a lookahead wearing a constant's
 * clothes. Slice 17's exact enumeration is where that arithmetic belongs.
 *
 * Two rungs are certain rather than estimated, and they are the two ends:
 *
 * - `generala-doble` is the cheapest box on the card. Reaching its 100 needs
 *   five of a kind AND a generala box already written above zero (ruleset §La
 *   precondición de la doble — "tachar no es anotar"), so it is strictly rarer
 *   than the generala it depends on, and it is the only box whose value can be
 *   zero for the whole match no matter what the dice do.
 * - `sixes` is the dearest, because it is the highest-paying box in the upper
 *   section and the one most likely to pay something on any given throw.
 *
 * The middle is a judgement call between boxes that are rare-but-large
 * (`escalera`, `generala`) and common-but-small (`twos`, `threes`), and it is
 * written down here so it can be argued with in one place.
 *
 * USED AT EVERY VALUE, NOT ONLY AT ZERO. Crossing out is not a separate rule in
 * this game — "una por turno, obligatorio" makes it what scoring degenerates
 * into when every open box is worth nothing (ruleset §Generalización de
 * scoring), so it is the same tie-break with a smaller number. One ladder
 * instead of two that could disagree.
 */
export const SACRIFICE_ORDER: readonly CategoryId[] = [
  "generala-doble",
  "ones",
  "escalera",
  "generala",
  "twos",
  "threes",
  "poker",
  "fours",
  "full",
  "fives",
  "sixes",
];

/**
 * Where this box sits on the ladder — lower is given up sooner.
 *
 * A box missing from `SACRIFICE_ORDER` would sort last rather than crash, which
 * is the safe direction: a twelfth category added to `CategoryId` and forgotten
 * here becomes the box this bot protects hardest, not one that takes the tier
 * down. `normal.test.ts` asserts the ladder names all eleven exactly once, so
 * the omission is caught by a red test rather than by a bot playing oddly.
 */
export function sacrificeRank(category: CategoryId): number {
  const rank = SACRIFICE_ORDER.indexOf(category);
  return rank === -1 ? SACRIFICE_ORDER.length : rank;
}

/**
 * What this box pays for the dice on the table right now — asked of the ENGINE,
 * every time.
 *
 * THIS IS THE WHOLE REASON NO TIER CARRIES A SCORING TABLE. `scoreFor` receives
 * the dice, the throw counter and the card, so the servida bonus (ruleset
 * §Sección inferior: `rollsUsed === SERVIDA_ROLL`) and the doble's precondition
 * (`card.generala !== null && card.generala > 0`) arrive with the answer
 * instead of being re-derived by a bot that would then be a second source of
 * truth about the ruleset. The two would not disagree today; they would
 * disagree the first time somebody edited one of them.
 *
 * The non-`deciding` answer is zero rather than a throw. A tier is only ever
 * asked where it has a legal action and the only phase that offers one is
 * `deciding` (`hidden-state.test.ts` asserts exactly that), so this arm is
 * unreachable through the port — and an unreachable arm on a tier's path is not
 * the place to put the first throw the design spent three layers removing.
 */
export function immediateValue(view: PlayerView, category: CategoryId): number {
  const turn = view.turn;
  if (turn.phase !== "deciding") return 0;
  return scoreFor(category, turn.dice, turn.rollsUsed, view.cards[view.self.seat]!);
}
