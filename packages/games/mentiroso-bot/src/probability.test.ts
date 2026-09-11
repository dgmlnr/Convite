import { describe, expect, it } from "vitest";
import { DIE_FACES, MAX_SEAT_COUNT, STARTING_DICE_PER_SEAT } from "@hexdev/mentiroso-engine";

import { atLeast, DIE_FACE_PROBABILITY } from "./probability.js";

/** The largest total-dice count this game ever reaches: every seat, full —
 * `MAX_SEAT_COUNT * STARTING_DICE_PER_SEAT`, imported rather than restated
 * as a literal `30` so the performance fence below tracks the real game
 * invariant instead of a number that could silently drift from it. */
const LARGEST_TABLE = MAX_SEAT_COUNT * STARTING_DICE_PER_SEAT;

describe("DIE_FACE_PROBABILITY (SDD `mentiroso`, work unit D1/task 4.1, design D7)", () => {
  it("is exactly one in six -- this ruleset has no wildcard to double it to one in three", () => {
    expect(DIE_FACE_PROBABILITY).toBeCloseTo(1 / 6, 15);
  });

  it("is derived from DIE_FACES.length, never restated as a hardcoded six", () => {
    // Triangulates the fake-it constant: a literal `1 / 6` would still pass
    // the test above, but only THIS assertion forces the derivation itself,
    // the same discipline `mentiroso-engine/src/bids.ts`'s own `HIGHEST_FACE`
    // already follows for the same array.
    expect(DIE_FACE_PROBABILITY).toBe(1 / DIE_FACES.length);
  });
});

describe("atLeast -- hand-calculated against the closed-form binomial tail, not against itself", () => {
  it("a single unseen die matches with probability exactly p", () => {
    // P(X >= 1) over one trial is just p itself.
    expect(atLeast(1, 1, 1 / 6)).toBeCloseTo(1 / 6, 12);
  });

  it("two unseen dice both matching is p squared", () => {
    // The only way k = n = 2 succeeds is every one of the two dice matching.
    expect(atLeast(2, 2, 1 / 6)).toBeCloseTo(1 / 36, 12);
  });

  it("at least one match among two dice is the complement of neither matching", () => {
    // P(X >= 1) = 1 - P(X = 0) = 1 - (5/6)^2 = 11/36.
    expect(atLeast(1, 2, 1 / 6)).toBeCloseTo(11 / 36, 12);
  });

  it("matches a manually written three-term tail for n = 3, k = 1, p = 1/3", () => {
    const term1 = 3 * (1 / 3) * (2 / 3) ** 2;
    const term2 = 3 * (1 / 3) ** 2 * (2 / 3);
    const term3 = (1 / 3) ** 3;
    expect(atLeast(1, 3, 1 / 3)).toBeCloseTo(term1 + term2 + term3, 12);
  });
});

describe("atLeast -- edge cases (design D7: own dice reduce k, sometimes below zero)", () => {
  it("k = 0 is certain regardless of n or p", () => {
    expect(atLeast(0, 10, 1 / 6)).toBe(1);
  });

  it("a negative k -- own dice already covering the bid -- is certain, same as k = 0", () => {
    // Realistic, not exotic: research C2's own combination rule lowers k by
    // the caller's own matching dice, and a seat that already holds enough
    // of them drives k to zero or below.
    expect(atLeast(-3, 5, 1 / 6)).toBe(1);
  });

  it("k greater than n is impossible", () => {
    expect(atLeast(5, 4, 1 / 6)).toBe(0);
  });

  it("n = 0 with k = 0 is certain -- nothing left to doubt, and nothing was demanded", () => {
    expect(atLeast(0, 0, 1 / 6)).toBe(1);
  });

  it("p = 1 -- every unseen die certainly matches -- is certain for any k up to n", () => {
    expect(atLeast(7, 10, 1)).toBe(1);
  });

  it("the k > n guard is not redundant at extreme p -- disabling it produces NaN, not 0", () => {
    // Deliberate negative control (AGENTS.md: "borrar una clausula y ver si
    // algo se rompe"). At realistic p (1/6, 1/3) and n <= 30 the guard is
    // provably redundant -- the multiplicative coefficient already reaches
    // exactly zero once k > n, with no help from this guard. It stops being
    // redundant once p sits close enough to 1 that (1 - p) ** (n - k), a
    // NEGATIVE exponent reached only by skipping this guard, overflows to
    // Infinity: 0 (the correctly-zeroed coefficient) times Infinity is NaN,
    // never 0. This reproduces that computation directly, standing in for
    // the guarded function with the guard removed.
    const k = 1000;
    const n = 1;
    const p = 1 - 1e-9;
    const q = 1 - p;
    let coefficientWithoutGuard = 1;
    for (let i = 1; i <= k; i += 1) coefficientWithoutGuard = (coefficientWithoutGuard * (n - i + 1)) / i;
    const termWithoutGuard = coefficientWithoutGuard * p ** k * q ** (n - k);
    expect(coefficientWithoutGuard).toBe(0);
    expect(termWithoutGuard).toBeNaN();
    // The guarded function itself never hits this: k > n returns 0 outright.
    expect(atLeast(k, n, p)).toBe(0);
  });
});

describe("atLeast -- p is a genuine parameter, never an internal literal (design D7's own trap)", () => {
  it("the same (k, n) pair discrepates strongly between p = 1/6 and the wildcard-tainted p = 1/3", () => {
    // Chosen where k sits CLOSE to n on purpose: that is where both
    // probabilities are SMALL rather than both near 1, which is this unit's
    // own named risk -- a fixture where the two readings are indistinguishable.
    const atSixth = atLeast(5, 6, 1 / 6);
    const atThird = atLeast(5, 6, 1 / 3);
    expect(atSixth).toBeGreaterThan(0);
    expect(atThird).toBeGreaterThan(atSixth * 5);
  });

  it("does not silently fall back to 1/6 (or any other baked-in value) when called with a different p", () => {
    const half = atLeast(1, 1, 0.5);
    expect(half).toBeCloseTo(0.5, 12);
    expect(half).not.toBeCloseTo(1 / 6, 2);
  });
});

describe("atLeast -- cross-checked against an independently structured computation, not against itself", () => {
  it("agrees with a probability mass function built by convolution, one die at a time", () => {
    // A DIFFERENT algorithm from the closed-form multiplicative recurrence
    // above: builds the full distribution incrementally, die by die, rather
    // than deriving a single term from a binomial-coefficient ratio. Two
    // structurally unrelated derivations agreeing is the actual proof the
    // formula is right, not merely internally consistent.
    const cases: ReadonlyArray<readonly [number, number]> = [
      [10, 1 / 6],
      [15, 1 / 3],
      [7, 0.2],
    ];
    for (const [n, p] of cases) {
      let pmf = [1];
      for (let die = 0; die < n; die += 1) {
        const next = new Array<number>(pmf.length + 1).fill(0);
        for (let matches = 0; matches < pmf.length; matches += 1) {
          next[matches] += pmf[matches]! * (1 - p);
          next[matches + 1] += pmf[matches]! * p;
        }
        pmf = next;
      }
      for (const k of [0, 1, Math.floor(n / 2), n, n + 1]) {
        const expected = pmf.slice(Math.max(k, 0)).reduce((sum, mass) => sum + mass, 0);
        expect(atLeast(k, n, p)).toBeCloseTo(expected, 9);
      }
    }
  });
});

describe("atLeast -- performance budget (a fence against a rewrite, not a tuned benchmark)", () => {
  it("stays orders of magnitude under the comparable bot's own 8.87 ms worst decision, at the largest table this game reaches", () => {
    const started = performance.now();
    for (let trial = 0; trial < 1000; trial += 1) {
      for (let k = 0; k <= LARGEST_TABLE; k += 1) atLeast(k, LARGEST_TABLE, DIE_FACE_PROBABILITY);
    }
    const elapsed = performance.now() - started;
    // 1000 * (LARGEST_TABLE + 1) = 31,000 calls in this budget -- generous by
    // roughly three orders of magnitude versus a term-by-term sum bounded by
    // 31 iterations each; a fence against an accidental exponential rewrite,
    // never a number anybody should need to tune.
    expect(elapsed).toBeLessThan(200);
  });
});
