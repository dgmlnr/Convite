import { describe, expect, it } from "vitest";
import { RANKS, SUITS, cardId } from "./card.js";
import { ALL_CARDS } from "./deck.js";

// Art-resolution coverage ("all 40 resolve, no card missing, no two cards
// share art") moved to front-image.test.ts, against the real on-disk WebP
// assets — that is the module actually responsible for it now. This file
// keeps the enumeration test unchanged (approval test: same behavior before
// and after the artwork-source change).
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
});
