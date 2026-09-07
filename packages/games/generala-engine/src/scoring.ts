import { DIE_FACES } from "./dice.js";
import type { Dice, DieFace } from "./dice.js";

/**
 * How many dice show each face. Every face is a key, even at zero.
 *
 * That last sentence is the contract, not an incidental detail of the
 * implementation. A tally built only from the faces actually rolled would read
 * `undefined` for the rest, and `undefined * 3` is `NaN` — so the upper section
 * would silently produce `NaN` on precisely the hands where a box is crossed out
 * at zero, which is the commonest event in a real match. Six keys, always, so
 * nothing downstream has to ask whether a face is there.
 */
export type DieCounts = Readonly<Record<DieFace, number>>;

/**
 * Read the five dice as a MULTISET — the one helper every rule in the game is
 * written against.
 *
 * All eleven categories are predicates over this tally and nothing else: the
 * upper section is `tally[face] * face`; a full is a 3 and a 2; a póker is a 4
 * or better; a generala is a 5; an escalera is five distinct faces matching one
 * of the two accepted runs. Because a tally forgets the order the cup dropped
 * them in, none of those predicates ever has to sort, permute or de-duplicate
 * anything, and `[3,3,3,2,2]` and `[2,3,2,3,3]` cannot be scored differently by
 * an implementation slip.
 *
 * The zeroed record is built FROM `DIE_FACES` rather than written out as a
 * literal, so "a die has six faces" is stated in exactly one place — the same
 * derive-don't-restate discipline `dice-ui` applies to its own asset set. One
 * pass over five dice afterwards, and no branching on which category is being
 * asked about: the caller decides that.
 */
export function counts(dice: Dice): DieCounts {
  const tally = {} as Record<DieFace, number>;
  for (const face of DIE_FACES) tally[face] = 0;
  for (const face of dice) tally[face] += 1;
  return tally;
}

// THE RULESET EVERY RULE BELOW IMPLEMENTS, named once so none of them has to
// re-argue it: `convite/generala/reglas-decididas` — the POPULAR set, eleven
// categories, chosen by the product owner over the manufacturer's own rulebook
// (Ruibal Games, Argentina) because the sources genuinely disagree. They differ
// on what a generala is worth, on whether generala doble exists at all, and on
// the escalera al as. Each rule below cites the section of THAT artifact and
// quotes it in its own Spanish, the way `escoba-engine/src/scoring.ts` quotes
// its regulation's articles — so a later variant is a data change against a
// cited table rather than an argument about what the game is.

/** Whether SOME face is showing exactly `n` times. */
function someFaceShows(tally: DieCounts, n: number): boolean {
  return DIE_FACES.some((face) => tally[face] === n);
}

/**
 * ruleset §Sección superior: "suma de los dados de ese número. Sin bonus."
 *
 * One multiplication, no branches, and — the part worth stating — NO THRESHOLD
 * AND NO BONUS at either end. A single 3 pays 3, and five 6s pay exactly 30;
 * the Yahtzee-style "63 in the upper section earns +35" that many players
 * expect is not in this ruleset and must not be smuggled in as a kindness.
 *
 * An unmatched number totals 0 rather than being refused: under the ruleset's
 * own generalization every still-open category is a legal target that evaluates
 * to whatever its rule yields, zero included, which is what makes "crossing
 * out" fall straight out of "one box per turn, obligatorio" instead of needing
 * its own action type.
 */
export function faceTotal(face: DieFace, dice: Dice): number {
  return counts(dice)[face] * face;
}

/**
 * The two accepted runs, and there are exactly two.
 *
 * ruleset §Escalera: `3-4-5-6-1` — the escalera al as — is listed by the
 * popular set as "opcional, a convenir de antemano", and it is DELIBERATELY
 * OUT. It cannot be a knob: `configOptions` must stay empty because
 * `deriveModalities` cartesian-products every option into an independent
 * matchmaking pool, and `platform-core/src/presence.test.ts:14` already asserts
 * by name that Generala has none. With no knob available, "a convenir" reads as
 * not on by default — agreeing is what you would do to ADD it.
 *
 * The stronger single-source reading, in which the 1 is a comodín standing in
 * as a 2 or as a 6, is EXPLICITLY REJECTED by the ruleset and must not appear
 * here in any shape.
 */
const ESCALERA_RUNS: readonly (readonly DieFace[])[] = [
  [1, 2, 3, 4, 5],
  [2, 3, 4, 5, 6],
];

/**
 * ruleset §Sección inferior: an escalera is one of the two runs above, showing
 * each of its five faces exactly once.
 *
 * Reading the run off the tally is what makes order irrelevant for free — no
 * sort, no permutation, no de-duplication — and `=== 1` per face is what makes
 * the predicate exact: five dice covering five distinct faces leaves no room
 * for a sixth, so a hand matching a run is that run and nothing else.
 */
export function isEscalera(dice: Dice): boolean {
  const tally = counts(dice);
  return ESCALERA_RUNS.some((run) => run.every((face) => tally[face] === 1));
}

/**
 * ruleset §Sección inferior: a full is three of one number and two of another.
 *
 * FIVE OF A KIND IS ALSO A FULL. Under the ruleset's generalization a category
 * evaluates to whatever its own rule yields for these dice, and a multiset of
 * five equal dice does contain three of a kind plus a pair. That reading is
 * what makes the manufacturer's "a juego mayor may go into its own box or into
 * another open one" free rather than a special case.
 *
 * Four of a kind is NOT a full, and it is the case an implementation gets
 * wrong: `[4,4,4,4,2]` holds three 4s, but the two dice left over are a 4 and a
 * 2, not a pair. Asking the tally for a face showing exactly 2 is what refuses
 * it; "three or more, and two dice left over" would wrongly accept. The two
 * counts cannot name the same face because 3 + 2 already spends all five dice.
 */
export function isFull(dice: Dice): boolean {
  const tally = counts(dice);
  return someFaceShows(tally, 5) || (someFaceShows(tally, 3) && someFaceShows(tally, 2));
}

/**
 * ruleset §Sección inferior: a póker is four of a kind.
 *
 * FOUR OR MORE, not exactly four — five of a kind contains four of a kind, the
 * same generalization `isFull` applies, and `=== 4` here would refuse the six
 * hands where the rule matters most.
 */
export function isPoker(dice: Dice): boolean {
  const tally = counts(dice);
  return DIE_FACES.some((face) => tally[face] >= 4);
}

/**
 * ruleset §Sección inferior: a generala is all five dice showing the same
 * number. The game is named after it, so it is written as the exact count it
 * is rather than as a `>=` that would also swallow a póker.
 */
export function isGenerala(dice: Dice): boolean {
  return someFaceShows(counts(dice), 5);
}
