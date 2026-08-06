import { describe, expect, it } from "vitest";
import { cardBackSvg } from "./card-back.js";
import { composeCardSvg } from "./card-svg.js";
import { ALL_CARDS } from "./deck.js";
import { DECK_THEME_DEFAULTS } from "./theme-tokens.js";

describe("theming: every default token is a valid CSS color literal, never empty", () => {
  it("provides a non-empty default for every token used by the deck", () => {
    for (const value of Object.values(DECK_THEME_DEFAULTS)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe("theming: no card front or the back ever hardcodes a color literal", () => {
  it("checks all 40 fronts for hardcoded fill/stroke colors", () => {
    for (const card of ALL_CARDS) {
      const svg = composeCardSvg(card);
      expect(svg).not.toMatch(/(?:fill|stroke)="#[0-9a-fA-F]/);
      expect(svg).not.toMatch(/(?:fill|stroke)="rgb/);
    }
  });

  it("checks the back for hardcoded fill/stroke colors", () => {
    const back = cardBackSvg();
    expect(back).not.toMatch(/(?:fill|stroke)="#[0-9a-fA-F]/);
    expect(back).not.toMatch(/(?:fill|stroke)="rgb/);
  });
});
