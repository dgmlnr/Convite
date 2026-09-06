/**
 * The dice and the cup a game like Generala would use, AS PIECES — no game
 * in it.
 *
 * NO GENERALA ENGINE, MODULE, OR RULE LIVES HERE, OR ANYWHERE ELSE IN THIS
 * REPOSITORY YET (`sdd/generala-props/explore`, verified against source
 * before this package existed: `packages/games/generala*` does not exist).
 * This package answers the question that has to come before that cycle —
 * how the physical pieces look and move — the same split
 * `mahjong-tile-ui`'s own docblock names for itself: "what any mahjong game
 * needs to DRAW a tile", not the game. `NAMED AFTER THE PIECE, NOT AFTER A
 * ROLE`, for the identical reason: a shared `dice-ui` cannot become
 * `game-props-ui` any more than `mahjong-tile-ui` could become `tile-ui`.
 *
 * L0, by rule as well as by intention (`l0-dice-ui-no-workspace-deps` in
 * `.dependency-cruiser.cjs`): it imports no workspace package at all, so it
 * cannot learn what a legal Generala move is, and a future game cannot
 * smuggle a rule in through the props.
 *
 * NO `assets/`, NO `LICENSE` — the first physical-piece package in this
 * repository that ships neither. A die's pips and a cup's silhouette are
 * generated vector shapes with no separate creative authorship to license,
 * unlike the tile's hanzi glyphs (CC BY-SA 4.0) or the deck's illustrated
 * suits (CC BY-SA 3.0) — see `sdd/generala-props/explore` §5 for the survey
 * that reached this conclusion.
 *
 * THE ONE NON-NEGOTIABLE CONTRACT THIS PACKAGE EXISTS TO HOLD: a die's
 * resting pose (`geometry.ts`'s `FACE_ROTATION`) is written from an
 * ALREADY-DECIDED face before any toss animation starts, and never
 * corrected afterward. Nothing here calls `Math.random()` or decides which
 * face lands — that is a future `generala-module`'s job, structurally
 * identical to how `truco-module/deal.ts` decides a deal and hands the
 * engine an already-materialized value.
 */
export type { DieFace, DieSide } from "./geometry.js";
export {
  CUP_BEVEL,
  CUP_FRAME,
  CUP_HEIGHT,
  CUP_RIM_DEPTH,
  CUP_RIM_INSET,
  CUP_RIM_WALL,
  CUP_TAP_MIN,
  CUP_VIEWBOX,
  CUP_WIDTH,
  DIE_BEVEL,
  DIE_FACES,
  DIE_FRAME,
  DIE_RADIUS,
  DIE_SIDE_FACE,
  DIE_SIDE_LOCAL_TRANSFORM,
  DIE_SIDE_ORDER,
  DIE_SIZE,
  DIE_VIEWBOX,
  FACE_PIP_SLOTS,
  FACE_ROTATION,
  PIP_RADIUS,
  PIP_SLOTS,
  restingPoseDeclaration,
} from "./geometry.js";
export type { DiceThemeToken } from "./theme-tokens.js";
export { DICE_THEME_DEFAULTS } from "./theme-tokens.js";
export { dieBodySvg } from "./die-body.js";
export { diePipsSvg } from "./die-pips.js";
export { dieFaceSvg } from "./die-face.js";
export { cupBodySvg } from "./cup-body.js";
export { createDieSceneElement } from "./die.js";
export { DICE_STYLE_ID, buildDiceStylesheet, ensureDiceStyles } from "./dice-styles.js";
export { announceRoll, createDiceAnnouncer } from "./dice-announcer.js";
export type { DiceCupHandle, DiceCupOptions } from "./dice.js";
export { createDiceCup } from "./dice.js";
