import { describe, expect, it } from "vitest";
import { RANKS, SUITS, cardId } from "./card.js";

describe("card", () => {
  it("has 4 suits", () => {
    expect(SUITS).toHaveLength(4);
    expect(SUITS).toEqual(["espada", "basto", "oro", "copa"]);
  });

  it("has the 10 ranks used by the 40-card Spanish deck (no 8s or 9s)", () => {
    expect(RANKS).toEqual([1, 2, 3, 4, 5, 6, 7, 10, 11, 12]);
  });

  it("builds a stable id from rank and suit", () => {
    expect(cardId({ suit: "oro", rank: 7 })).toBe("7-oro");
  });
});
