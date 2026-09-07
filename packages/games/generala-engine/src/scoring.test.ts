import { describe, expect, it } from "vitest";

import { DIE_FACES } from "./dice.js";
import type { Dice } from "./dice.js";
import { counts } from "./scoring.js";

describe("counts", () => {
  it("tallies how many dice show each face", () => {
    expect(counts([6, 6, 6, 2, 1])).toEqual({ 1: 1, 2: 1, 3: 0, 4: 0, 5: 0, 6: 3 });
  });

  it("tallies a different hand differently", () => {
    // Triangulation against a hardcoded tally: nothing about the shape of the
    // first hand survives into this one.
    expect(counts([4, 4, 1, 2, 3])).toEqual({ 1: 1, 2: 1, 3: 1, 4: 2, 5: 0, 6: 0 });
    expect(counts([5, 5, 5, 5, 5])).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 5, 6: 0 });
  });

  it("reads 0, never undefined, for a face nobody rolled", () => {
    // DECLARED AS HAVING NO ISOLATING MUTATION, measured rather than assumed: a
    // sparse tally that records only the faces it saw was planted, and it reds
    // the two `toEqual` cases above as well as this one (4 of 5 tests here go
    // red). So this test proves nothing those two do not already prove, and it
    // is kept anyway for the reason the archive's rung 4 permits — it states the
    // contract in the words a CONSUMER needs, at the place a consumer reads it.
    //
    // The contract: every face is an own key, always. Not because a missing key
    // looks untidy, but because `tally[3] * 3` is then `NaN` rather than 0 — and
    // that lands on exactly the hands where an upper box is crossed out at zero,
    // which is the commonest event in a real match. The property below is what
    // actually caught that `NaN` when the mutation was planted.
    const tally = counts([2, 2, 2, 2, 2]);

    for (const face of DIE_FACES) {
      expect(tally[face]).toBe(face === 2 ? 5 : 0);
      expect(Object.hasOwn(tally, String(face))).toBe(true);
    }
  });

  it("always tallies exactly five dice, for every hand there is", () => {
    // [PROPERTY] over all 6^5 = 7 776 hands, enumerated rather than sampled —
    // the whole space is small enough that "for every hand" can be literal. A
    // tally that dropped, double-counted or clamped a face would break the sum
    // for some hand in here, and nothing narrower would have to notice.
    let hands = 0;
    for (const a of DIE_FACES)
      for (const b of DIE_FACES)
        for (const c of DIE_FACES)
          for (const d of DIE_FACES)
            for (const e of DIE_FACES) {
              const tally = counts([a, b, c, d, e]);
              const total = DIE_FACES.reduce((sum, face) => sum + tally[face], 0);
              expect(total).toBe(5);
              hands += 1;
            }

    expect(hands).toBe(6 ** 5);
  });

  it("does not care what order the dice landed in", () => {
    // [PROPERTY] Every rule in this game reads the dice as a MULTISET — a full
    // is a full however the cup dropped it. That is what makes this one helper
    // able to back all eleven predicates, so it is asserted here rather than
    // re-argued in each of them.
    const hand: Dice = [3, 1, 6, 1, 4];

    expect(counts([1, 1, 3, 4, 6])).toEqual(counts(hand));
    expect(counts([6, 4, 3, 1, 1])).toEqual(counts(hand));
  });
});
