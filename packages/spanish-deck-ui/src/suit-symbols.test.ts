import { describe, expect, it } from "vitest";
import { SUITS } from "./card.js";
import { suitSymbolMarkup } from "./suit-symbols.js";

describe("suit-symbols", () => {
  it("produces non-empty, distinct markup for all 4 suits (distinct silhouettes, not just distinct color)", () => {
    const markups = SUITS.map((suit) => suitSymbolMarkup(suit));
    for (const markup of markups) {
      expect(markup.length).toBeGreaterThan(0);
    }
    expect(new Set(markups).size).toBe(SUITS.length);
  });

  it("colors every suit symbol via its own CSS custom property, never a hardcoded color", () => {
    for (const suit of SUITS) {
      const markup = suitSymbolMarkup(suit);
      expect(markup).toContain(`var(--deck-suit-${suit})`);
      // no hex/rgb/named-color fill or stroke literals anywhere in the fragment
      expect(markup).not.toMatch(/(?:fill|stroke)="#[0-9a-fA-F]/);
      expect(markup).not.toMatch(/(?:fill|stroke)="rgb/);
    }
  });
});
