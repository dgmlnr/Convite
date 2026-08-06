import { describe, expect, it } from "vitest";
import { RANKS, SUITS, cardId } from "./card.js";
import { ALL_CARDS, getCardArt } from "./deck.js";

describe("deck", () => {
  it("enumerates exactly the 40 cards of the Spanish deck, no duplicates, none missing", () => {
    expect(ALL_CARDS).toHaveLength(40);
    const ids = new Set(ALL_CARDS.map(cardId));
    expect(ids.size).toBe(40);
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        expect(ids.has(cardId({ suit, rank }))).toBe(true);
      }
    }
  });

  it("resolves art for all 40 cards — no card silently falls through to empty/undefined art", () => {
    for (const card of ALL_CARDS) {
      const art = getCardArt(card);
      expect(typeof art).toBe("string");
      expect(art.length).toBeGreaterThan(0);
      expect(art).toContain("<svg");
      expect(art).toContain("</svg>");
    }
  });

  it("gives every card a unique art string (no two cards accidentally render identically)", () => {
    const arts = new Set(ALL_CARDS.map((card) => getCardArt(card)));
    expect(arts.size).toBe(40);
  });
});
