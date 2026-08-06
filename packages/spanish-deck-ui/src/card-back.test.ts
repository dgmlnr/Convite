import { describe, expect, it } from "vitest";
import { cardBackSvg } from "./card-back.js";
import { suitSymbolMarkup } from "./suit-symbols.js";
import { SUITS } from "./card.js";

describe("card-back", () => {
  it("renders without needing a Card at all (a back is not a projection of a front)", () => {
    const markup = cardBackSvg();
    expect(markup).toContain("<svg");
    expect(markup).toContain("</svg>");
  });

  it("is visually separable from every card front: it never embeds a suit symbol's markup", () => {
    const back = cardBackSvg();
    for (const suit of SUITS) {
      expect(back).not.toContain(suitSymbolMarkup(suit));
    }
  });

  it("only uses back-specific theme variables, never a front/suit theme variable", () => {
    const back = cardBackSvg();
    expect(back).toMatch(/var\(--deck-back-bg/);
    expect(back).toMatch(/var\(--deck-back-accent/);
    for (const suit of SUITS) {
      expect(back).not.toContain(`--deck-suit-${suit}`);
    }
  });

  it("colors nothing with a hardcoded color literal", () => {
    const back = cardBackSvg();
    expect(back).not.toMatch(/(?:fill|stroke)="#[0-9a-fA-F]/);
    expect(back).not.toMatch(/(?:fill|stroke)="rgb/);
  });
});
