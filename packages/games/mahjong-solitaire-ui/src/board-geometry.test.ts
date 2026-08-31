import { describe, expect, it } from "vitest";
import { LAYOUT } from "@hexdev/mahjong-solitaire-engine";
import { TILE_BEVEL, TILE_FRAME } from "@hexdev/mahjong-tile-ui";
import {
  BOARD_COLUMNS,
  BOARD_HALF_CELLS_TALL,
  BOARD_HALF_CELLS_WIDE,
  BOARD_INLINE_IN_TILE_WIDTHS,
  BOARD_LAYERS,
  BOARD_BLOCK_IN_TILE_HEIGHTS,
  BOARD_ROWS,
  LAYER_STEP_X,
  LAYER_STEP_Y,
  TILE_LAYER_STEP,
} from "./board-geometry.js";

describe("the turtle's extent is read off the layout, never typed beside it", () => {
  it("spans 30 half-cells by 16, i.e. 15 tile-columns by 8 tile-rows, across 5 layers", () => {
    // The three the data decides. 15 and 8 are the measurement's own finding
    // ("12 wide" is the shell body and forgets the three arm tiles); 5 is
    // z 0..4. Literals here and derivations there, so a layout swap moves
    // these numbers rather than agreeing with itself.
    expect(BOARD_HALF_CELLS_WIDE).toBe(30);
    expect(BOARD_HALF_CELLS_TALL).toBe(16);
    expect(BOARD_COLUMNS).toBe(15);
    expect(BOARD_ROWS).toBe(8);
    expect(BOARD_LAYERS).toBe(5);
  });

  it("reads a real layout rather than an empty one — a span derived from nothing is 0, not 15", () => {
    // R6, in the shape a derived EXTENT can fail vacuously: `Math.max` of an
    // empty list is -Infinity and every span below collapses. Sized against
    // the collection it guards, never against a literal a neighbouring fence
    // also asserts (R14).
    expect(LAYOUT.length).toBeGreaterThan(0);
    expect(BOARD_HALF_CELLS_WIDE).toBe(BOARD_COLUMNS * 2);
    expect(BOARD_HALF_CELLS_TALL).toBe(BOARD_ROWS * 2);
  });
});

describe("the layer step, and what it is measured against", () => {
  /**
   * DECLARED, THEN FENCED AGAINST THE RULE — the same arrangement slice 6
   * used for the raster dimension, and for the same reason: a constant
   * COMPUTED from the artwork's own numbers makes its own derivation fence a
   * tautology (R15's sibling shape). Two literals, two independent ways to
   * be wrong, and a mutation of either reds one of these.
   */
  it("is 24 artwork units — TWICE the tile's own frame plus its own bevel", () => {
    // The doubling is what a rendered turtle produced. At one edge-width the
    // upper tile's outline lands against the lower tile's, the two dark lines
    // read as one, and five layers come out a flat mosaic. See the constant's
    // own docblock for the render that settled it.
    expect(TILE_LAYER_STEP).toBe(24);
    expect(TILE_LAYER_STEP).toBe(2 * (TILE_FRAME + TILE_BEVEL));
  });

  it("becomes 17.17% of a tile's width and 12% of its height, because the tile is not square", () => {
    // The asymmetry IS the artwork: 24 units of a 139.764-wide box is a
    // bigger fraction than 24 units of a 200-tall one. A single "layer
    // offset" fraction shared by both axes would shear the stack.
    expect(LAYER_STEP_X).toBeCloseTo(0.1717180, 7);
    expect(LAYER_STEP_Y).toBeCloseTo(0.12, 10);
    expect(LAYER_STEP_X).toBeGreaterThan(LAYER_STEP_Y);
  });
});

describe("the board's box, in tiles", () => {
  it("is 15.686872 tile-widths across and 8.48 tile-heights tall", () => {
    // Four steps, not five: five layers have four gaps between them.
    expect(BOARD_INLINE_IN_TILE_WIDTHS).toBeCloseTo(15.686872, 6);
    expect(BOARD_BLOCK_IN_TILE_HEIGHTS).toBeCloseTo(8.48, 10);
  });

});
