import { LAYOUT } from "@hexdev/mahjong-solitaire-engine";
import { TILE_HEIGHT, TILE_WIDTH } from "@hexdev/mahjong-tile-ui";

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
 * one place to change.
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
