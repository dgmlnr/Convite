/**
 * The five dice, as the RULES see them.
 *
 * THIS UNION IS DECLARED TWICE IN THE REPO ON PURPOSE, and the duplication is
 * the design (D14), not an oversight somebody should tidy up. `dice-ui` has its
 * own identical `DieFace` in `geometry.ts` because it is the die AS A PICTURE —
 * a cube, six facelets, a resting-pose table. This one is the die AS A VALUE a
 * rule reads. `l0-game-engine-no-workspace-deps` forbids this package every
 * workspace import anyway, and `l0-dice-ui-no-workspace-deps`'s own comment says
 * that rule exists precisely to stop "a Generala engine being smuggled in
 * through the props" — so importing the type, even `import type`, is not
 * available and would not be wanted if it were.
 *
 * They meet structurally in `generala-ui` and nowhere else, exactly as
 * `spanish-deck-ui`'s `Card` and `escoba-engine`'s `Card` already do. Both are
 * the same literal union, so assignment across that seam needs no cast and no
 * adapter.
 */
export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Every face, ascending.
 *
 * `counts` builds its zeroed tally FROM this rather than writing `1..6` out a
 * second time, so "a die has six faces" is stated in exactly one place. The same
 * derive-don't-restate discipline `dice-ui` applies to its own asset set, and for
 * the same reason: a second statement of a fact is a second chance to disagree
 * with the first, and it is the disagreement nobody would ever see.
 */
export const DIE_FACES: readonly DieFace[] = [1, 2, 3, 4, 5, 6];

/**
 * Exactly five dice, as a tuple rather than an array.
 *
 * The length is part of the type because every rule in the game is written
 * against five dice — a full is 3+2 of five, an escalera is a permutation of
 * five, the upper section sums at most five. A `readonly DieFace[]` would let a
 * four-die or six-die hand reach `scoreFor` and be scored as though it were
 * legal, and nothing but a runtime check would notice.
 */
export type Dice = readonly [DieFace, DieFace, DieFace, DieFace, DieFace];

/**
 * How many dice are in the cup, as a VALUE.
 *
 * The tuple above already says five, and says it where it does the most good —
 * but a type cannot be counted at runtime, and enumerating the hold surface
 * means walking the five positions one by one. Stated here, beside the tuple it
 * has to agree with, rather than as a `5` sitting in whichever file needed it.
 */
export const DICE_COUNT = 5;
