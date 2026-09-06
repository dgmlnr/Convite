import { describe, expect, it } from "vitest";
import { DIE_RADIUS, DIE_SIZE, DIE_VIEWBOX } from "./geometry.js";
import { DICE_THEME_DEFAULTS } from "./theme-tokens.js";
import { dieBodySvg } from "./die-body.js";

/**
 * The bone is GENERATED, the same call `tileBodySvg()` makes for the
 * mahjong tile and `cardBackSvg()` makes for the card back — a die has no
 * shipped raster underneath it to draw over, so the whole face lives here.
 */
describe("die-body: the die is drawn, and needs no pips to be a solid object", () => {
  it("renders an svg on the die's own square viewBox", () => {
    const markup = dieBodySvg();
    expect(markup).toContain("<svg");
    expect(markup).toContain("</svg>");
    expect(markup).toContain(`viewBox="${DIE_VIEWBOX}"`);
  });

  it("colours nothing with a hardcoded literal, so a tenant can theme it", () => {
    const markup = dieBodySvg();
    expect(markup).not.toMatch(/(?:fill|stroke)="#[0-9a-fA-F]/);
    expect(markup).not.toMatch(/(?:fill|stroke)="rgb/);
  });

  it("uses only tokens theme-tokens actually defaults, so nothing renders unpainted", () => {
    const used = [...dieBodySvg().matchAll(/var\((--[a-z-]+)/g)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((token) => !(token in DICE_THEME_DEFAULTS)), "used but never defaulted").toEqual([]);
  });

  /**
   * A BEVEL IS TWO DIFFERENT COLOURS OR IT IS NOT A BEVEL — the identical
   * argument `tile-body.test.ts` makes for the mahjong tile's own ring.
   */
  it("lights one pair of edges and shades the other", () => {
    const markup = dieBodySvg();
    expect(markup).toContain("var(--dice-bevel-light)");
    expect(markup).toContain("var(--dice-bevel-shade)");
  });

  /**
   * No `<defs>`, deliberately: this repository carries the scar of a
   * `<defs>` scoped to the wrong subtree (`visual/README.md`'s matchstick-
   * scoreboard incident), and flat fills need none at all.
   */
  it("carries no defs, because flat fills do not need one", () => {
    expect(dieBodySvg()).not.toContain("<defs");
  });

  it("fills the whole square, so the bone reaches every edge the pips could sit near", () => {
    const markup = dieBodySvg();
    expect(markup).toContain(`width="${String(DIE_SIZE)}"`);
    expect(markup).toContain(`height="${String(DIE_SIZE)}"`);
    expect(markup).toContain(`rx="${String(DIE_RADIUS)}"`);
  });
});

describe("theme-tokens: every default is a real colour, and the die's and the cup's surfaces are both accounted for", () => {
  it("defaults every token to a non-empty string", () => {
    for (const value of Object.values(DICE_THEME_DEFAULTS)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("names exactly the eleven surfaces this package draws — nine plus the interior's two, added when the cup's mouth stopped being a lid", () => {
    expect(Object.keys(DICE_THEME_DEFAULTS).sort()).toEqual(
      [
        "--dice-bevel-light",
        "--dice-bevel-shade",
        "--dice-cup-bevel-light",
        "--dice-cup-bevel-shade",
        "--dice-cup-edge",
        "--dice-cup-face",
        "--dice-cup-interior-light",
        "--dice-cup-interior-shade",
        "--dice-edge",
        "--dice-face",
        "--dice-pip",
      ].sort(),
    );
  });

  it("gives the die's lit and shaded edge different defaults", () => {
    expect(DICE_THEME_DEFAULTS["--dice-bevel-light"]).not.toBe(DICE_THEME_DEFAULTS["--dice-bevel-shade"]);
  });

  it("gives the cup's lit and shaded edge different defaults too", () => {
    expect(DICE_THEME_DEFAULTS["--dice-cup-bevel-light"]).not.toBe(DICE_THEME_DEFAULTS["--dice-cup-bevel-shade"]);
  });

  it("gives the cup's interior two different defaults too, both darker than either exterior bevel tone", () => {
    expect(DICE_THEME_DEFAULTS["--dice-cup-interior-light"]).not.toBe(DICE_THEME_DEFAULTS["--dice-cup-interior-shade"]);
  });
});
