import { describe, expect, it } from "vitest";
import { composeCardSvg } from "./card-svg.js";
import { CARD_HEIGHT, CARD_WIDTH } from "./geometry.js";

describe("card-svg: numeral cards (1-7) are composed from the suit symbol, never hand-drawn", () => {
  it("renders the correct pip count for every numeral rank by counting suit-symbol instances", () => {
    for (let rank = 1; rank <= 7; rank++) {
      const svg = composeCardSvg({ suit: "oro", rank: rank as 1 });
      const pipGroupCount = (svg.match(/data-pip="oro"/g) ?? []).length;
      expect(pipGroupCount).toBe(rank);
    }
  });

  it("carries the correct viewBox for the standard card aspect ratio", () => {
    const svg = composeCardSvg({ suit: "copa", rank: 5 });
    expect(svg).toContain(`viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}"`);
  });
});

describe("card-svg: court cards (sota/caballo/rey) use the hand-drawn figure, not pips", () => {
  it("embeds exactly one court figure and zero pip groups for rank 10/11/12", () => {
    for (const rank of [10, 11, 12] as const) {
      const svg = composeCardSvg({ suit: "espada", rank });
      expect((svg.match(/data-pip=/g) ?? []).length).toBe(0);
      expect((svg.match(/data-court-figure="espada"/g) ?? []).length).toBe(1);
    }
  });
});

describe("card-svg: legibility — every card shows a corner rank index, readable without counting pips", () => {
  it("renders the corner index twice (top-left and mirrored bottom-right)", () => {
    const svg = composeCardSvg({ suit: "basto", rank: 3 });
    expect((svg.match(/data-corner-index/g) ?? []).length).toBe(2);
  });

  it("labels court cards with their rank initial (S/C/R), not a number", () => {
    expect(composeCardSvg({ suit: "oro", rank: 10 })).toContain(">S<");
    expect(composeCardSvg({ suit: "oro", rank: 11 })).toContain(">C<");
    expect(composeCardSvg({ suit: "oro", rank: 12 })).toContain(">R<");
  });
});
