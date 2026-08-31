import { describe, expect, it } from "vitest";
import {
  TILE_ART_HEIGHT,
  TILE_ART_RATIO,
  TILE_ART_WIDTH,
  TILE_BEVEL,
  TILE_FRAME,
  TILE_HEIGHT,
  TILE_MAX_INLINE_SIZE,
  TILE_RADIUS,
  TILE_RASTER_OVERSAMPLE,
  TILE_VIEWBOX,
  TILE_WIDTH,
} from "./geometry.js";

/**
 * The body's numbers come FROM the artwork, not from a picture of a tile
 * somebody remembered. Each case re-runs one step of that, so a constant
 * edited on its own stops agreeing with the constant it came from — which is
 * the failure `spanish-deck-ui/src/front-image.ts:128-141` records: a
 * dimension whose rationale outlived the artwork it was measured from.
 */
describe("geometry: the body registers with the artwork, it does not contain it", () => {
  /**
   * The one that would have caught the mistake this file was written with
   * first. Reading "the face symbol only, no tile body" as "inset the face
   * inside a slab" puts the artwork's own outline inside a second frame. It
   * is not a bare symbol: the alpha bounding box is the FULL canvas on every
   * one of the 42, because each file draws the tile's outline out to the
   * edge and leaves the interior transparent.
   */
  it("shares the artwork's box exactly, so the two overlay instead of nesting", () => {
    expect(TILE_WIDTH).toBe(TILE_ART_WIDTH);
    expect(TILE_HEIGHT).toBe(TILE_ART_HEIGHT);
  });

  /**
   * NOT 3:4. This change's earlier arithmetic assumed r = 0.75 for "a real
   * mahjong tile"; the drawing is 0.69882 and anything that fits a board has
   * to use the drawing's number, because forcing 3:4 could only stretch the
   * artwork or letterbox it.
   */
  it("carries the artwork's own proportion and not the remembered 3:4", () => {
    expect(TILE_WIDTH / TILE_HEIGHT).toBeCloseTo(TILE_ART_RATIO, 10);
    expect(TILE_WIDTH / TILE_HEIGHT).not.toBeCloseTo(0.75, 3);
  });

  it("declares the artwork's intrinsic ratio from its own two numbers, never as a literal", () => {
    expect(TILE_ART_RATIO).toBe(TILE_ART_WIDTH / TILE_ART_HEIGHT);
    expect(TILE_ART_RATIO).toBeCloseTo(0.69882, 5);
  });

  /**
   * The bevel can only show where the artwork is transparent, so it has to
   * start inside the artwork's own outline AND finish inside the corner arc.
   * Both bounds were measured off a rasterized face, not chosen.
   */
  it("keeps the bevel inside the artwork's own frame, where there is anything to see", () => {
    expect(TILE_BEVEL).toBeLessThan(TILE_FRAME);
    // The stroke is centred on its path, so what has to clear the corner arc
    // is the CENTRELINE's inset — anything else leaves the generated arc with
    // a negative radius, which renders as nothing at all.
    expect(TILE_FRAME + TILE_BEVEL / 2).toBeLessThan(TILE_RADIUS);
  });

  it("publishes a viewBox that matches the body it describes", () => {
    expect(TILE_VIEWBOX).toBe(`0 0 ${String(TILE_WIDTH)} ${String(TILE_HEIGHT)}`);
  });
});

/**
 * THE CAP IS WHAT MAKES THE RASTER DERIVABLE AT ALL.
 *
 * `process-svg-deck.mjs:25-29` derived the deck's 329 from "the largest card
 * the game ever draws is 122px, so 329 is already 2.7x". Applying that rule
 * to a board needs the LARGEST on-screen width — and the 29.5px this board's
 * render measurement produced is the SMALLEST-container width, the one a
 * phone binds. 2.7x of that is the 80px figure the measurement itself
 * floated, and it is the rule read backwards: it would rasterize for the
 * smallest tile anyone ever sees.
 *
 * A container has no upper bound, so the largest width has to be declared
 * rather than measured. `TILE_MAX_INLINE_SIZE` is that declaration, the board
 * draws `min(container-derived, cap)`, and the raster follows from it.
 */
describe("geometry: the declared cap bounds the largest tile anyone can see", () => {
  it("caps the tile above the widest container the render measurement reached", () => {
    // ~71px per tile on a 1400x900 desktop container (this change's render
    // measurement). The cap sits just above it, so no measured container is
    // shrunk by it and nothing larger buys pixels nobody asked for.
    expect(TILE_MAX_INLINE_SIZE).toBeGreaterThanOrEqual(71);
    expect(TILE_MAX_INLINE_SIZE).toBeLessThan(2 * 71);
  });

  it("keeps the deck's oversample factor, so both artworks answer to one rule", () => {
    expect(TILE_RASTER_OVERSAMPLE).toBe(2.7);
  });
});
