import { describe, expect, it } from "vitest";
import { cardBackSvg } from "./card-back.js";
import { SUITS } from "./card.js";

describe("card-back", () => {
  it("renders without needing a Card at all (a back is not a projection of a front)", () => {
    const markup = cardBackSvg();
    expect(markup).toContain("<svg");
    expect(markup).toContain("</svg>");
  });

  // Previously verified separability by asserting the back never contains a
  // hand-drawn suit symbol's markup — moot now that fronts are shipped
  // WebP photographs (front-image.ts), not generated SVG with markup to leak.
  // The meaningful separability claim today is that the back never embeds a
  // reference to any front image asset either — it stays a self-contained
  // SVG, not a wrapper around a front image.
  it("is separable from the card fronts: it never references a front image asset", () => {
    const back = cardBackSvg();
    expect(back).not.toContain(".webp");
    expect(back).not.toContain("assets/fronts");
    for (const suit of SUITS) {
      expect(back).not.toContain(`data-corner-index="${suit}"`);
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
