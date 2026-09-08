import { DICE_COUNT, DIE_FACES } from "@hexdev/generala-engine";
import type { DieFace } from "@hexdev/generala-engine";

/**
 * WHAT THE CUP CAN DO, ENUMERATED ONCE — a fact about dice, not a policy over a
 * position, and not a tier's opinion about either.
 *
 * `heuristics.ts` holds facts about a POSITION (which dice match, what a box
 * pays, which box a seat minds losing least). This file sits one step behind
 * that: it is what the dice themselves can become, with no view, no scorecard
 * and no notion of a category anywhere in it. `hard.ts` is the only consumer
 * today and it is the reason this exists, but the table it needs is arithmetic
 * about six-sided dice rather than anything about Generala, so it is not
 * `hard.ts`'s private business either.
 *
 * BEYOND DESIGN D7'S FILE LIST, AND SAID SO. D7 enumerates
 * `easy/normal/hard/heuristics/latency/fixtures/index`; slice 8 already had to
 * add `tier.ts` for the same kind of reason and declared it. This one is here
 * because "the enumeration is EXACT, not Monte Carlo" (task 17.1) is a claim
 * about a table, and a claim about a table can only be checked against that
 * table — buried inside the tier's evaluation loop it would be provable only
 * through the decisions it happens to change.
 */

/**
 * One thing five dice can turn into, and how often.
 *
 * `faces` is a MULTISET, written ascending. Order is not dropped as a
 * convenience: `scoreFor` reads the dice through `counts()` and every one of
 * the eleven rules is a predicate over that tally, so `[3,3,2]` and `[2,3,3]`
 * are the same event to every question this tier can ask. Enumerating them
 * separately would be enumerating the same answer twice.
 *
 * `weight` is how many of the `6^k` ordered throws land on this row — the
 * multinomial coefficient `k! / ∏ mᶠ!`. It is an INTEGER, deliberately: the
 * distribution is exact, and an integer is the only shape in which "exact" is
 * not a tolerance somebody can widen later.
 */
export interface RollOutcome {
  readonly faces: readonly DieFace[];
  readonly weight: number;
}

/** `n!`, computed rather than tabulated so there is no second table to disagree with the first. */
function factorialOf(n: number): number {
  let product = 1;
  for (let step = 2; step <= n; step += 1) product *= step;
  return product;
}

/**
 * How many ordered throws produce this exact multiset: `k! / ∏ mᶠ!`.
 *
 * The denominator is built by walking the ascending row and multiplying by the
 * length of each run as it grows — a run of m equal faces contributes
 * `1 × 2 × … × m`, which is `m!`, and equal faces are contiguous BECAUSE the
 * row is ascending. That is the second thing the ordering buys, after
 * comparability: no tally, no second pass, and no way for the denominator to
 * disagree about which faces repeated.
 */
function arrangementsOf(faces: readonly DieFace[]): number {
  let denominator = 1;
  let runLength = 0;
  let previous: DieFace | null = null;

  for (const face of faces) {
    runLength = face === previous ? runLength + 1 : 1;
    previous = face;
    denominator *= runLength;
  }

  return factorialOf(faces.length) / denominator;
}

/**
 * Every multiset of `size` faces, ascending, each with its weight.
 *
 * The walk only ever recurses at `index` or later, never before it, so every
 * row it emits is non-decreasing by construction rather than by a sort call
 * somebody could forget — the same discipline `legal-actions.ts` applies to
 * `KEEP_SETS`, and for a related reason: an ascending row is a canonical name
 * for an event, so two rows naming one event cannot both be in the table.
 */
function enumerateMultisets(size: number): readonly RollOutcome[] {
  const outcomes: RollOutcome[] = [];
  const chosen: DieFace[] = [];

  const walk = (from: number): void => {
    if (chosen.length === size) {
      outcomes.push({ faces: [...chosen], weight: arrangementsOf(chosen) });
      return;
    }
    for (let index = from; index < DIE_FACES.length; index += 1) {
      chosen.push(DIE_FACES[index]!);
      walk(index);
      chosen.pop();
    }
  };

  walk(0);
  return outcomes;
}

/**
 * The six tables, built once at module scope.
 *
 * A decision evaluates up to 31 holds and the five sizes between them cover
 * 1682 rows in total, so rebuilding a table per hold would recompute the same
 * 252 rows for every keep of the same width. Built from `DICE_COUNT` rather
 * than from a literal 6, so "five dice" stays stated in the engine.
 */
const OUTCOMES_BY_SIZE: readonly (readonly RollOutcome[])[] = Array.from({ length: DICE_COUNT + 1 }, (_unused, size) => enumerateMultisets(size));

/**
 * The table for a throw of `diceRolled` dice: 1, 6, 21, 56, 126 or 252 rows.
 *
 * TOTAL, AND EMPTY OUTSIDE THE RANGE. `5 - keep.length` cannot leave `0..5`
 * given an offer list the engine built, so nothing reachable asks for another
 * size — and an unreachable arm is exactly where the design spent three layers
 * making sure a tier grows no throw of its own (D7). An empty table makes
 * `expectedValueOfHold` weigh nothing and answer 0, which loses to every real
 * score, instead of producing a `NaN` that would win every comparison it
 * touched.
 *
 * `diceRolled === 0` is a real row and not an edge case to refuse: it is "the
 * cup was not thrown, the hand stands", one outcome of weight one.
 */
export function rollOutcomes(diceRolled: number): readonly RollOutcome[] {
  return OUTCOMES_BY_SIZE[diceRolled] ?? [];
}

/**
 * How many ORDERED throws of `diceRolled` dice exist: `6^k`.
 *
 * This is the divisor `expectedValueOfHold` normalizes by, and normalizing by
 * this rather than by the sum of the weights it just added up is a deliberate
 * choice. Dividing a weighted total by its own total weight makes any
 * enumeration self-consistent — a table missing half its rows, or a sampler
 * that drew a hundred, would each produce a confident average of the wrong
 * distribution. Dividing by a count derived independently from the number of
 * faces means the arithmetic only comes out at 1 if the table really is every
 * outcome, which is precisely what `outcomes.test.ts` pins.
 */
export function orderedThrowCount(diceRolled: number): number {
  return DIE_FACES.length ** diceRolled;
}
