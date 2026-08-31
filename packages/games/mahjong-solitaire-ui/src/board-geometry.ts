import { LAYOUT } from "@hexdev/mahjong-solitaire-engine";
import { TILE_ART_RATIO, TILE_HEIGHT, TILE_MAX_INLINE_SIZE, TILE_WIDTH } from "@hexdev/mahjong-tile-ui";

/**
 * How big the turtle is, and how big one of its tiles may be — all of it
 * arithmetic, none of it a measurement.
 *
 * NOTHING HERE READS A DOM BOX, and that is the constraint the whole board
 * is built under: an embedded widget's available room is its container's,
 * never the viewport's, so the sheet asks CSS for it (`100cqw`, and `100dvh`
 * in the one mode where the host pins the widget to the window) and this
 * module only says what to do with the answer. There is no `ResizeObserver`,
 * no `matchMedia` and no `innerWidth` in this package, and
 * `no-measurement.test.ts` is what keeps that true.
 *
 * The numbers below therefore exist twice on purpose: once here, where they
 * can be reasoned about and mutated, and once inside the stylesheet — which
 * INTERPOLATES them from this module rather than restating them, so there is
 * one place to change and `board-fit.browser.test.ts` measures the real
 * element against `bindingTileWidth`'s prediction to prove the two agree.
 */

/** The turtle's own footprint, in half-cells, read off the layout data.
 * A tile at `(x, y, z)` occupies `x..x+1` by `y..y+1`, so the span is the
 * largest coordinate plus the two half-cells that tile itself covers. */
export const BOARD_HALF_CELLS_WIDE = Math.max(...LAYOUT.map((position) => position.x)) + 2;
export const BOARD_HALF_CELLS_TALL = Math.max(...LAYOUT.map((position) => position.y)) + 2;

/** 15 and 8 — the measurement's own finding, and the reason "the turtle is
 * 12 wide" is wrong: 12 is the shell body and the three arm tiles are not in
 * it. Derived rather than written, so swapping the layout data moves them. */
export const BOARD_COLUMNS = BOARD_HALF_CELLS_WIDE / 2;
export const BOARD_ROWS = BOARD_HALF_CELLS_TALL / 2;

/** Five: z runs 0..4 on the classic turtle, apex included. */
export const BOARD_LAYERS = Math.max(...LAYOUT.map((position) => position.z)) + 1;

/**
 * HOW FAR A LAYER SITS UP AND TO THE RIGHT OF THE ONE BELOW IT, in the
 * artwork's own units — the only thing on this board that is a choice rather
 * than a consequence, and the one number here that was settled by LOOKING.
 *
 * TWICE THE TILE'S OWN EDGE STRUCTURE, and the doubling is the whole finding.
 * What makes a tile read as a separate object is its drawn edge: `TILE_FRAME`,
 * the dark outline the artwork paints out to its canvas edge, plus
 * `TILE_BEVEL`, the lit/shaded ring `tileBodySvg` strokes just inside it. The
 * first version of this constant was exactly that sum, 12, on the argument
 * that clearing the lower tile's edge is what makes it visible.
 *
 * A RENDERED TURTLE FALSIFIED IT. At ONE edge-width of step the upper tile's
 * own outline lands directly against the lower tile's: two dark lines touching
 * read as one thicker line, which is precisely what a same-layer NEIGHBOUR
 * looks like. The centre of the board came out a flat mosaic — five layers
 * deep and no way to tell which tile was on top, which is not an aesthetic
 * complaint in a game whose entire rule is "can this tile be lifted". At TWO
 * edge-widths the lower tile's frame and bevel stay visible BESIDE the upper
 * tile's, with bone between them, and the board terraces.
 *
 * AND IT IS ALMOST FREE, which is why the first derivation's caution was
 * misplaced. Four steps come out of the board's box on each axis, so at the
 * binding container this doubling costs 0.9px of tile (31.72 to 30.82) and
 * 0.39 points of empty felt (41.22% to 41.61%). The step on screen goes from
 * 2.72px — under three pixels, smeared into the outline by antialiasing — to
 * 5.29px, which is a step you can see.
 *
 * WRITTEN OUT, NOT COMPUTED, for the reason slice 6 recorded against the
 * raster dimension: `2 * (TILE_FRAME + TILE_BEVEL)` here would be correct by
 * construction, and the fence beside it would be re-running this expression
 * against its own inputs — green against any code. Declared, the literal can
 * disagree with the rule, and there is a fence for each.
 */
export const TILE_LAYER_STEP = 24;

/** The same step as a fraction of a tile, which is what CSS needs — and the
 * two are DIFFERENT because the tile is not square. Sharing one fraction
 * across both axes would shear the stack. */
export const LAYER_STEP_X = TILE_LAYER_STEP / TILE_WIDTH;
export const LAYER_STEP_Y = TILE_LAYER_STEP / TILE_HEIGHT;

/** The whole board's box, expressed in tiles: the flat footprint plus the
 * offsets of the four gaps BETWEEN the five layers. */
export const BOARD_INLINE_IN_TILE_WIDTHS = BOARD_COLUMNS + (BOARD_LAYERS - 1) * LAYER_STEP_X;
export const BOARD_BLOCK_IN_TILE_HEIGHTS = BOARD_ROWS + (BOARD_LAYERS - 1) * LAYER_STEP_Y;

/** The felt this board is drawn on, on every side. Exported because the
 * stylesheet writes it AND `bindingTileWidth`'s callers have to subtract it
 * from a window height — one number, never two that agree today. */
export const BOARD_PADDING = 8;

/** The room a board has been given, both sides already net of
 * `BOARD_PADDING`. Named for CSS's own logical axes, because that is what
 * the sheet is written in. */
export interface BoardRoom {
  readonly inlineSize: number;
  readonly blockSize: number;
}

/** The board's real pixel box for a given tile width. */
export interface BoardExtent {
  readonly inlineSize: number;
  readonly blockSize: number;
}

/**
 * The tile width a given room affords: the smallest of what the width can
 * pay for, what the height can pay for, and the cap.
 *
 * THE CAP IS THE HALF SLICE 6 SHIPPED UNCONSUMED. `TILE_MAX_INLINE_SIZE`
 * exists because the raster dimension needed a largest-ever-drawn width and a
 * board has none — it fills its container, and a container has no upper
 * bound. This is the other end of that bargain: having declared 72px so the
 * artwork could be rasterized for it, the board must never draw wider than
 * 72px, or the raster is undersampled for a size we promised not to reach.
 *
 * The HEIGHT is what binds on every real phone, and that is the whole of
 * design D1's argument: a wider layout would spend the recovered width on
 * more columns, never on a bigger tile. Re-checked at the artwork's real
 * ratio in `board-geometry.test.ts` — the crossover is 26.2 columns, not the
 * 23.6 D1 computed at r = 0.75.
 */
export function bindingTileWidth(room: BoardRoom): number {
  const byInline = room.inlineSize / BOARD_INLINE_IN_TILE_WIDTHS;
  const byBlock = (room.blockSize / BOARD_BLOCK_IN_TILE_HEIGHTS) * TILE_ART_RATIO;
  return Math.min(byInline, byBlock, TILE_MAX_INLINE_SIZE);
}

/** The board's own box at a given tile width. The block side goes through
 * the artwork's ratio rather than a second constant, so a tile that is not
 * 0.69882 wide cannot produce a board that thinks it is. */
export function boardExtent(tileWidth: number): BoardExtent {
  return {
    inlineSize: tileWidth * BOARD_INLINE_IN_TILE_WIDTHS,
    blockSize: (tileWidth / TILE_ART_RATIO) * BOARD_BLOCK_IN_TILE_HEIGHTS,
  };
}

/**
 * How much of the room's width the board does NOT use.
 *
 * PINNED BY A TEST, because design D1 accepted this margin on the condition
 * that it be a number somebody looked at rather than a surprise. On a rotated
 * phone it is 41.6%. It is not the 36.6% this change carried for six slices:
 * that was computed at r = 0.75, from an asset survey that described the
 * artwork as a bare face symbol. The drawing IS the tile, at its own 0.69882,
 * and a narrower tile against the same height budget is a narrower board.
 */
export function emptyInlineFraction(room: BoardRoom): number {
  return 1 - boardExtent(bindingTileWidth(room)).inlineSize / room.inlineSize;
}
