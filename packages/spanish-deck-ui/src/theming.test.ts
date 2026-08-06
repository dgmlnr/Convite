import { describe, expect, it } from "vitest";
import { cardBackSvg } from "./card-back.js";
import { DECK_THEME_DEFAULTS } from "./theme-tokens.js";

// The "no card front ever hardcodes a color literal" test that used to live
// here is REMOVED, not silently dropped: it existed to prove every
// suit/court-figure fill in the generated SVG routed through a
// `--deck-suit-*` custom property. Fronts are now Fournier 1878 WebP
// photographs (front-image.ts) — there is no SVG markup to scan, and
// `--deck-suit-*` no longer exists as a token. This is intentional and
// matches the "hybrid theming by zone" decision (obs 2955): the front keeps
// its own fixed identity across every tenant; only the back remains
// CSS-themeable.
describe("theming: every default token is a valid CSS color literal, never empty", () => {
  it("provides a non-empty default for every token used by the deck", () => {
    for (const value of Object.values(DECK_THEME_DEFAULTS)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("only defines the two back-facing tokens now — no leftover front/suit token", () => {
    expect(Object.keys(DECK_THEME_DEFAULTS).sort()).toEqual(["--deck-back-accent", "--deck-back-bg"]);
  });
});

describe("theming: the card back never hardcodes a color literal", () => {
  it("checks the back for hardcoded fill/stroke colors", () => {
    const back = cardBackSvg();
    expect(back).not.toMatch(/(?:fill|stroke)="#[0-9a-fA-F]/);
    expect(back).not.toMatch(/(?:fill|stroke)="rgb/);
  });
});
