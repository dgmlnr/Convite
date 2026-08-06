import { describe, expect, it } from "vitest";
import { CARD_HEIGHT, CARD_WIDTH } from "./geometry.js";
import { PIP_LAYOUTS, type NumeralRank } from "./pip-layout.js";

const NUMERAL_RANKS: readonly NumeralRank[] = [1, 2, 3, 4, 5, 6, 7];

describe("pip-layout", () => {
  it("has a layout entry for every numeral rank 1-7, none missing", () => {
    expect(Object.keys(PIP_LAYOUTS).map(Number).sort((a, b) => a - b)).toEqual(NUMERAL_RANKS);
  });

  for (const rank of NUMERAL_RANKS) {
    it(`rank ${rank} has exactly ${rank} pip position(s)`, () => {
      expect(PIP_LAYOUTS[rank]).toHaveLength(rank);
    });

    it(`rank ${rank}'s pips all sit inside the card's interior bounds`, () => {
      for (const pip of PIP_LAYOUTS[rank]) {
        expect(pip.x).toBeGreaterThan(0);
        expect(pip.x).toBeLessThan(CARD_WIDTH);
        expect(pip.y).toBeGreaterThan(0);
        expect(pip.y).toBeLessThan(CARD_HEIGHT);
      }
    });
  }

  it("never places two pips of the same rank at the exact same position", () => {
    for (const rank of NUMERAL_RANKS) {
      const seen = new Set(PIP_LAYOUTS[rank].map((p) => `${p.x},${p.y}`));
      expect(seen.size).toBe(PIP_LAYOUTS[rank].length);
    }
  });
});
