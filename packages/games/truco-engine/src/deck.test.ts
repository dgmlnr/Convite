import { describe, expect, it } from "vitest";
import { cardId } from "./card.js";
import { buildDeck } from "./deck.js";

describe("buildDeck", () => {
  it("builds exactly 40 unique cards", () => {
    const deck = buildDeck();

    expect(deck).toHaveLength(40);
    expect(new Set(deck.map(cardId)).size).toBe(40);
  });

  it("contains no 8s or 9s (excluded from the 40-card Spanish deck)", () => {
    const deck = buildDeck();

    expect(deck.some((card) => (card.rank as number) === 8 || (card.rank as number) === 9)).toBe(false);
  });
});
