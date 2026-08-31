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
export type { MahjongBoardCallbacks, MahjongBoardRenderer } from "./board.js";
export { createMahjongBoardRenderer } from "./board.js";
export { BOARD_STYLE_ID, buildBoardStylesheet, ensureBoardStyles } from "./board-styles.js";
export type { HitTestRoot } from "./hit-test.js";
export { TILE_POSITION_ATTRIBUTE, tileIndexAtPoint } from "./hit-test.js";
export type { MahjongPair, PairSelectionMove } from "./pair-selection.js";
export { resolvePress } from "./pair-selection.js";
export type { BoardTiles } from "./board-identity.js";
export { isSameBoard } from "./board-identity.js";
export type { Chronometer, ChronometerClock, ChronometerContext } from "./chronometer.js";
export { createChronometer, elapsedWholeSeconds, formatElapsed } from "./chronometer.js";
export type { ElapsedReadoutTicker } from "./elapsed-readout.js";
export {
  ELAPSED_READOUT_CLASS,
  ELAPSED_READOUT_STYLE_ID,
  buildElapsedReadoutStylesheet,
  elapsedReadoutText,
  ensureElapsedReadoutStyles,
  renderElapsedReadout,
  startElapsedReadout,
  windowTicker,
} from "./elapsed-readout.js";
export type { MahjongMatchOverProps, MahjongOutcomeInfo } from "./match-over.js";
export { MAHJONG_DEADLOCK_MESSAGE, mahjongMatchOverMessage } from "./match-over.js";
export type { MahjongMatchOverViewProps } from "./match-over-view.js";
export { MATCH_OVER_STYLE_ID, buildMatchOverStylesheet, ensureMatchOverStyles, renderMahjongMatchOver } from "./match-over-view.js";
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
