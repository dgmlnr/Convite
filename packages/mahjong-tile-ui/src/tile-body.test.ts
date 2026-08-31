import { describe, expect, it } from "vitest";
import { TILE_BEVEL, TILE_FRAME, TILE_HEIGHT, TILE_RADIUS, TILE_VIEWBOX, TILE_WIDTH } from "./geometry.js";
import { TILE_THEME_DEFAULTS } from "./theme-tokens.js";
import { tileBodySvg } from "./tile-body.js";

/**
 * The body is GENERATED, not shipped — the same call `card-back.ts` makes.
 * It is the half of a tile this repository actually owns: the 42 files draw
 * the tile's outline and its symbol and leave the INTERIOR transparent, so
 * the bone a player reads as the tile itself does not exist until this
 * function draws it, and it is nobody's derivative.
 */
describe("tile-body: the tile is drawn, and it needs no face to be one", () => {
  it("renders an svg on the body's own viewBox", () => {
    const markup = tileBodySvg();
    expect(markup).toContain("<svg");
    expect(markup).toContain("</svg>");
    expect(markup).toContain(`viewBox="${TILE_VIEWBOX}"`);
  });

  it("references no face asset — a body is not a wrapper around a face image", () => {
    const markup = tileBodySvg();
    expect(markup).not.toContain(".webp");
    expect(markup).not.toContain("assets/tiles");
    expect(markup).not.toContain("<image");
  });

  it("colours nothing with a hardcoded literal, so a tenant can theme the slab", () => {
    const markup = tileBodySvg();
    expect(markup).not.toMatch(/(?:fill|stroke)="#[0-9a-fA-F]/);
    expect(markup).not.toMatch(/(?:fill|stroke)="rgb/);
  });

  it("uses only tokens that theme-tokens actually defaults, so nothing renders unpainted", () => {
    const used = [...tileBodySvg().matchAll(/var\((--[a-z-]+)/g)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((token) => !(token in TILE_THEME_DEFAULTS)), "used but never defaulted").toEqual([]);
  });

  /**
   * A BEVEL IS TWO DIFFERENT COLOURS OR IT IS NOT A BEVEL. What reads as
   * depth is a lit edge above and a shaded edge below; painting both with one
   * token leaves a flat rectangle with a border, which still looks like
   * markup that works.
   */
  it("lights one pair of edges and shades the other", () => {
    const markup = tileBodySvg();
    expect(markup).toContain("var(--mj-tile-bevel-light)");
    expect(markup).toContain("var(--mj-tile-bevel-shade)");
  });

  /**
   * No `<defs>`, and that is deliberate rather than incidental: a gradient
   * would need one, and this repository already has the scar from a `<defs>`
   * whose custom properties were scoped to a different subtree than the
   * element referencing it. Flat fills need no `<defs>` at all. Whether the
   * bevel earns a gradient is the board slice's call, and it can be made
   * without moving this fence.
   */
  it("carries no defs, because flat fills do not need one", () => {
    expect(tileBodySvg()).not.toContain("<defs");
  });

  /**
   * The bone has to reach UNDER the artwork's outline, not stop short of it:
   * the outline is opaque out to the canvas edge, so a fill inset by even a
   * unit leaves a hairline of felt showing around every tile on the board.
   */
  it("fills the whole box, because the artwork's outline sits exactly on it", () => {
    const markup = tileBodySvg();
    expect(markup).toContain(`width="${String(TILE_WIDTH)}"`);
    expect(markup).toContain(`height="${String(TILE_HEIGHT)}"`);
    expect(markup).toContain(`rx="${String(TILE_RADIUS)}"`);
  });

  /**
   * And the bevel has to start inside that outline, because the only region
   * the artwork leaves see-through is the interior. A ring drawn at the
   * boundary is painted over by the very edge it is meant to give depth to —
   * present in the markup, invisible on screen.
   */
  it("draws the bevel inside the artwork's frame rather than on the boundary", () => {
    const markup = tileBodySvg();
    const inset = TILE_FRAME + TILE_BEVEL / 2;
    expect(markup).toContain(`M${String(inset)} `);
    expect(markup).not.toContain("M0 ");
  });
});

describe("theme-tokens: every default is a real colour, and there are no orphans", () => {
  it("defaults every token to a non-empty string", () => {
    const values = Object.values(TILE_THEME_DEFAULTS);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("defines exactly the four surfaces a tile has", () => {
    expect(Object.keys(TILE_THEME_DEFAULTS).sort()).toEqual([
      "--mj-tile-bevel-light",
      "--mj-tile-bevel-shade",
      "--mj-tile-edge",
      "--mj-tile-face",
    ]);
  });

  it("gives the lit and the shaded edge different defaults", () => {
    expect(TILE_THEME_DEFAULTS["--mj-tile-bevel-light"]).not.toBe(TILE_THEME_DEFAULTS["--mj-tile-bevel-shade"]);
  });
});
