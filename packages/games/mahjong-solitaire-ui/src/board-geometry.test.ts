import { describe, expect, it } from "vitest";
import { LAYOUT } from "@hexdev/mahjong-solitaire-engine";
import { TILE_ART_RATIO, TILE_BEVEL, TILE_FRAME, TILE_MAX_INLINE_SIZE } from "@hexdev/mahjong-tile-ui";
import {
  BOARD_COLUMNS,
  BOARD_HALF_CELLS_TALL,
  BOARD_HALF_CELLS_WIDE,
  BOARD_INLINE_IN_TILE_WIDTHS,
  BOARD_LAYERS,
  BOARD_BLOCK_IN_TILE_HEIGHTS,
  BOARD_PADDING,
  BOARD_ROWS,
  LAYER_STEP_X,
  LAYER_STEP_Y,
  TILE_LAYER_STEP,
  bindingTileWidth,
  boardExtent,
  emptyInlineFraction,
} from "./board-geometry.js";

/**
 * A rotated phone, fullscreen, minus this board's own padding — the smallest
 * live container this widget ever gets, and therefore the one whose numbers
 * are worth pinning. 844x390 is the same window `escoba-viewport-fit` and
 * `table-viewport-fit` already measure against, so all three fences describe
 * the same physical screen.
 *
 * BOTH SIDES ARE NET OF PADDING, which is what `bindingTileWidth` is
 * specified to take, and it is not symmetric in the stylesheet: `100cqw` is
 * already the container's CONTENT box, while `100dvh` is the whole window and
 * has the padding subtracted explicitly. The two arrive here as one shape on
 * purpose — the model has one notion of "room", and the sheet is what knows
 * where each side of it comes from.
 */
const PHONE_LANDSCAPE = { inlineSize: 844 - 2 * BOARD_PADDING, blockSize: 390 - 2 * BOARD_PADDING } as const;

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

  it("scales to real pixels without ever consulting a DOM box", () => {
    const extent = boardExtent(30.820599056603772);
    expect(extent.inlineSize).toBeCloseTo(483.4788, 3);
    expect(extent.blockSize).toBeCloseTo(374, 6);
  });
});

describe("the binding tile width is the smallest of three budgets, and each one can win", () => {
  /**
   * THE HEIGHT WINS ON EVERY REAL PHONE. 374px of block over 8.48
   * tile-heights is a 44.10px tile, whose width is 30.82px; the same
   * container's 828px of inline would have afforded 52.78px. This is the
   * number task 7.10's browser fence measures the real element against, and
   * the number the legibility verdict is taken at.
   */
  it("phone landscape, fullscreen: 30.821px, decided by the height", () => {
    expect(bindingTileWidth(PHONE_LANDSCAPE)).toBeCloseTo(30.820599, 5);
  });

  it("a tall narrow column: the inline budget wins instead", () => {
    // 300px of inline over 15.686872 is 19.12px, well under both the block
    // budget (2000px of height would afford 164.8px) and the cap.
    expect(bindingTileWidth({ inlineSize: 300, blockSize: 2000 })).toBeCloseTo(19.124, 3);
  });

  it("a desktop window: the declared cap wins, and nothing grows past it", () => {
    // 1400x900 is the widest container the render measurement reached. Both
    // budgets there are larger than the cap, so the cap is the answer — which
    // is the half of `min(container-derived, cap)` slice 6 shipped unconsumed.
    expect(bindingTileWidth({ inlineSize: 1384, blockSize: 884 })).toBe(TILE_MAX_INLINE_SIZE);
  });

  it("the board it produces never exceeds the room it was given", () => {
    for (const box of [PHONE_LANDSCAPE, { inlineSize: 300, blockSize: 2000 }, { inlineSize: 1384, blockSize: 884 }]) {
      const extent = boardExtent(bindingTileWidth(box));
      expect(extent.inlineSize, `inline overflow at ${String(box.inlineSize)}x${String(box.blockSize)}`).toBeLessThanOrEqual(box.inlineSize + 1e-9);
      expect(extent.blockSize, `block overflow at ${String(box.inlineSize)}x${String(box.blockSize)}`).toBeLessThanOrEqual(box.blockSize + 1e-9);
    }
  });
});

describe("the empty felt, pinned as a number somebody accepted", () => {
  /**
   * 41.61%, AND IT IS NOT THE 36.6% THIS CHANGE CARRIED FOR SIX SLICES.
   *
   * That figure was computed at r = 0.75 — "a real mahjong tile" — from an
   * asset survey that described this artwork as a bare face symbol. Slice 6
   * rendered one and found the drawing IS the tile, outline and all, at its
   * own r = 0.69882. A narrower tile is a narrower board against the same
   * height budget, so the felt gets emptier, not fuller. Re-derived here
   * rather than carried.
   */
  it("a rotated phone leaves 41.6% of the felt's width empty", () => {
    expect(emptyInlineFraction(PHONE_LANDSCAPE)).toBeCloseTo(0.41609, 5);
  });

  it("and the tile ratio is what moved it — 0.75 would have left 37.3%", () => {
    // The counterfactual, run rather than asserted from memory: hold the
    // model fixed and change only the ratio. 0.75 gives a 33.078px tile and a
    // 518.8px board, so 4.3 points of the empty felt are the artwork's
    // proportion and nothing else.
    const tileAtThreeQuarters = (PHONE_LANDSCAPE.blockSize / BOARD_BLOCK_IN_TILE_HEIGHTS) * 0.75;
    const boardAtThreeQuarters = tileAtThreeQuarters * BOARD_INLINE_IN_TILE_WIDTHS;
    expect(1 - boardAtThreeQuarters / PHONE_LANDSCAPE.inlineSize).toBeCloseTo(0.37332, 5);
    expect(TILE_ART_RATIO).toBeCloseTo(0.69882, 6);
  });
});

describe("design D1's ceiling argument, re-checked at the artwork's real ratio", () => {
  /**
   * D1 SURVIVES, AND WITH MORE ROOM THAN IT CLAIMED.
   *
   * The argument: a wider layout buys no bigger tile, because the tile is
   * sized by the ROW count and the width budget is nowhere near binding.
   * D1 computed the crossover at 23.6 columns using r = 0.75. At the real
   * 0.69882 the tile is narrower, so MORE of them fit in the same 828px and
   * the crossover moves OUT to 26.2 columns. Every published turtle-family
   * layout is inside that range, so the conclusion holds a fortiori — but it
   * is asserted here, not inherited, because the number it was computed from
   * turned out to be wrong.
   */
  it("the inline budget only starts to bind past 26.2 tile-columns", () => {
    const tile = bindingTileWidth(PHONE_LANDSCAPE);
    const crossover = PHONE_LANDSCAPE.inlineSize / tile - (BOARD_LAYERS - 1) * LAYER_STEP_X;
    expect(crossover).toBeCloseTo(26.178, 3);
    expect(crossover).toBeGreaterThan(BOARD_COLUMNS);
  });

  it("so 15, 20 and 25 columns all yield the identical tile, and 27 yields a smaller one", () => {
    const inlineFor = (columns: number): number => PHONE_LANDSCAPE.inlineSize / (columns + (BOARD_LAYERS - 1) * LAYER_STEP_X);
    const blockBound = (PHONE_LANDSCAPE.blockSize / BOARD_BLOCK_IN_TILE_HEIGHTS) * TILE_ART_RATIO;
    const at = (columns: number): number => Math.min(inlineFor(columns), blockBound, TILE_MAX_INLINE_SIZE);

    expect(at(15)).toBeCloseTo(at(20), 10);
    expect(at(20)).toBeCloseTo(at(25), 10);
    // Past the crossover the extra columns come out of the tile, which is
    // what makes "fill the box" buy appearance and nothing measurable.
    expect(at(27)).toBeLessThan(at(15));
  });
});
