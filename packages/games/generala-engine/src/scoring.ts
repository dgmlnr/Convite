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
