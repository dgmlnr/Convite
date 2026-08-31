/**
 * The solitaire's own presentation layer: the turtle on the felt.
 *
 * L1, by the same `packages/games/*-ui` convention `truco-ui` and `escoba-ui`
 * already stand on — it may import its engine (`mahjong-solitaire-engine`)
 * and the artwork (`mahjong-tile-ui`), and it may not reach a module, a
 * transport or an app. What it does NOT import is the game module, which is
 * why the renderer takes a plain tile array rather than a `SolitairePlayerView`:
 * the rule about who may see what belongs one tier up.
 */
export type { BoardExtent, BoardRoom } from "./board-geometry.js";
export {
  BOARD_BLOCK_IN_TILE_HEIGHTS,
  BOARD_COLUMNS,
  BOARD_HALF_CELLS_TALL,
  BOARD_HALF_CELLS_WIDE,
  BOARD_INLINE_IN_TILE_WIDTHS,
  BOARD_LAYERS,
  BOARD_PADDING,
  BOARD_ROWS,
  LAYER_STEP_X,
  LAYER_STEP_Y,
  TILE_LAYER_STEP,
  bindingTileWidth,
  boardExtent,
  emptyInlineFraction,
} from "./board-geometry.js";
