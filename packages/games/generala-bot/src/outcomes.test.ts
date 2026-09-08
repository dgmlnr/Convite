import { describe, expect, it } from "vitest";
import { DICE_COUNT, DIE_FACES } from "@hexdev/generala-engine";
import type { DieFace } from "@hexdev/generala-engine";
import { orderedThrowCount, rollOutcomes } from "./outcomes.js";

/**
 * THE ORACLE, AND IT IS DELIBERATELY THE OTHER ALGORITHM.
 *
 * `outcomes.ts` enumerates MULTISETS and pays each one a multinomial weight.
 * This walks every ORDERED sequence the cup can drop — all `6^k` of them — and
 * tallies them by their sorted key. The two are different programs answering
 * the same question, so agreeing is evidence rather than a restatement: a copy
 * of the implementation would agree with a broken implementation too.
 *
 * It is also what makes task 17.1's "EXACT, not Monte Carlo" checkable at all.
 * A sampler cannot produce these integers; it produces numbers near them, and
 * `toBe` on an integer is not a tolerance anybody can widen quietly.
 *
 * `6^5` is 7776 sequences, which is the whole reason the tier does not walk
 * them: the multiset table is 252 rows for the same answer.
 */
function tallyEveryOrderedThrow(size: number): ReadonlyMap<string, number> {
  const tally = new Map<string, number>();
  const walk = (rolled: readonly DieFace[]): void => {
    if (rolled.length === size) {
      const key = [...rolled].sort((left, right) => left - right).join(",");
      tally.set(key, (tally.get(key) ?? 0) + 1);
      return;
    }
    for (const face of DIE_FACES) walk([...rolled, face]);
  };
  walk([]);
  return tally;
}

/** `C(6 + k - 1, k)`, the closed form for multisets of size k over six faces. */
function multisetCount(size: number): number {
  let count = 1;
  for (let step = 1; step <= size; step += 1) count = (count * (DIE_FACES.length + size - step)) / step;
  return count;
}

const SIZES: readonly number[] = [0, 1, 2, 3, 4, 5];

describe("the enumeration is over MULTISETS, which is the whole cost argument (task 17.1)", () => {
  it("the table is C(6+k-1, k) rows — 1, 6, 21, 56, 126, 252", () => {
    expect(SIZES.map((size) => rollOutcomes(size).length)).toEqual([1, 6, 21, 56, 126, 252]);
    for (const size of SIZES) expect(rollOutcomes(size).length).toBe(multisetCount(size));
  });

  /**
   * The claim stated as the comparison it is really making. Sequences and
   * multisets agree at k = 0 and k = 1 and part company immediately after, so
   * the split is asserted where it exists rather than over a range where it
   * would be vacuous.
   */
  it("and it is NOT the 6^k sequence table — 21 rows against 36, 252 against 7776", () => {
    for (const size of [2, 3, 4, 5]) {
      expect(rollOutcomes(size).length).toBeLessThan(orderedThrowCount(size));
    }
    expect(rollOutcomes(2).length).toBe(21);
    expect(orderedThrowCount(2)).toBe(36);
    expect(rollOutcomes(DICE_COUNT).length).toBe(252);
    expect(orderedThrowCount(DICE_COUNT)).toBe(7776);
  });

  it("every row is an ascending multiset of real faces, and no row is written twice", () => {
    for (const size of SIZES) {
      const rows = rollOutcomes(size);
      const keys = rows.map((outcome) => outcome.faces.join(","));
      expect(new Set(keys).size).toBe(rows.length);
      for (const outcome of rows) {
        expect(outcome.faces.length).toBe(size);
        expect([...outcome.faces].sort((left, right) => left - right)).toEqual([...outcome.faces]);
        for (const face of outcome.faces) expect(DIE_FACES).toContain(face);
      }
    }
  });

  /**
   * `k = 0` is not a curiosity: `expectedValueOfHold` derives its size from
   * `5 - keep.length`, so a keep of all five lands here. The engine never
   * offers one (`legal-actions.ts`: 31 holds, never 32) and the row still has
   * to mean something — "nothing was thrown, the hand stands" — rather than
   * divide by an empty table.
   */
  it("throwing no dice is one outcome of weight one, not an empty table", () => {
    expect(rollOutcomes(0)).toEqual([{ faces: [], weight: 1 }]);
    expect(orderedThrowCount(0)).toBe(1);
  });
});

describe("the weights are multinomial, and they are checked against every ordered throw", () => {
  /**
   * Two rows a reader can check by hand while reading this one: three dice
   * showing 1-1-2 can be dropped in three orders and 1-2-3 in six, so the table
   * pays them 3 and 6 against 1-1-1's single 1.
   *
   * Those two lines WERE their own `it`, and it was removed after being
   * measured rather than after being read. Every weight mutation in the ladder
   * — a flat weight of 1, a dropped run denominator, a run restarting at 0, an
   * off-by-one factorial — reds this comparison and reds that one, and this one
   * is the complete statement while that one was four sampled rows of it. Slice
   * 16's own finding, applied a second time: a fence another test already
   * catches is not coverage, it is a second place to fix the same thing.
   */
  it("each row's weight is exactly how many of the 6^k ordered throws produce it", () => {
    for (const size of SIZES) {
      const oracle = tallyEveryOrderedThrow(size);
      const enumerated = new Map(rollOutcomes(size).map((outcome) => [outcome.faces.join(","), outcome.weight]));
      expect(enumerated).toEqual(oracle);
    }
  });

  /**
   * The normalizer stated as an integer identity rather than as a float
   * comparison, because that is the form no tolerance can absorb. The
   * probability restatement follows it for the reason task 17.1 words it that
   * way — the weights ARE a distribution — but the integer line is the one that
   * fails loudly.
   */
  it("the weights sum to 6^k exactly, so the probabilities sum to 1", () => {
    for (const size of SIZES) {
      const weights = rollOutcomes(size).map((outcome) => outcome.weight);
      expect(weights.reduce((left, right) => left + right, 0)).toBe(orderedThrowCount(size));
      expect(weights.reduce((left, right) => left + right / orderedThrowCount(size), 0)).toBeCloseTo(1, 12);
    }
  });
});

describe("a size the game cannot ask for answers with nothing rather than with a throw", () => {
  /**
   * D7's second layer, in this file: no path a tier stands on carries a throw.
   * `5 - keep.length` cannot leave this range, so the arm is unreachable
   * through the engine — and an unreachable arm is not where the design's one
   * shared guard gets a quiet second copy. The empty table is what makes
   * `expectedValueOfHold` answer 0 there instead of `NaN`.
   */
  it("negative and oversized throws return an empty table", () => {
    expect(rollOutcomes(-1)).toEqual([]);
    expect(rollOutcomes(DICE_COUNT + 1)).toEqual([]);
  });

  /**
   * THE INDEPENDENCE OF THE DIVISOR, AND A MUTATION IS WHY THIS EXISTS.
   *
   * Rewriting `orderedThrowCount` as "the sum of the weights in the table"
   * passed every assertion above, because the table is correct and the two
   * numbers therefore agree everywhere the table has a row. That is exactly the
   * self-consistency `outcomes.ts` argues against in writing: a divisor read off
   * the enumeration would make ANY enumeration normalize to 1, including a
   * broken one and including a sampler's hundred draws.
   *
   * A size outside the table is where the two come apart, and there is only one
   * such input: the table has no sixth row and `6^6` is still 46 656. Asserting
   * it here is the claim stated where it can fail rather than in a docstring.
   */
  it("the divisor is read off the faces, not off the table, so it answers where the table does not", () => {
    expect(rollOutcomes(DICE_COUNT + 1)).toEqual([]);
    expect(orderedThrowCount(DICE_COUNT + 1)).toBe(46_656);
  });
});
