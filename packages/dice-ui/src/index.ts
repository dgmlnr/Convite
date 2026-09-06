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
 * `assets/` AND `LICENSE` NOW EXIST, WHERE THEY ONCE DELIBERATELY DID NOT.
 * The original release drew a die's pips and a cup's silhouette as flat
 * generated vector shapes needing no attribution — the product owner
 * rejected that art outright ("no me gustan" the pips, "quiero algo de
 * calidad" the cup), so both are now Blender renders (`tools/render-
 * props.py`): the die's ivory is fully procedural (no third-party input at
 * all), the cup's leather is a CC0 Poly Haven scan (no attribution
 * obligation either, just recorded for traceability in `assets/LICENSE`).
 * See `art.ts` for how a face/the cup resolve to a URL, the same shape
 * `mahjong-tile-ui/front-image.ts` already uses for its own shipped raster.
 *
 * THE CSS CUBE MECHANISM ITSELF IS UNCHANGED. Only what paints each
 * facelet/the cup button changed — `die.ts` still assembles six statically-
 * posed facelets under one `transform-style: preserve-3d` cube, and
 * `FACE_ROTATION` below is still the one table a roll ever consults for
 * which face lands up.
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
  CUP_HEIGHT,
  CUP_TAP_MIN,
  CUP_WIDTH,
  DIE_FACES,
  DIE_REST_TILT,
  DIE_SIDE_FACE,
  DIE_SIDE_LOCAL_TRANSFORM,
  DIE_SIDE_ORDER,
  DIE_SIZE,
  FACE_PIP_SLOTS,
  FACE_ROTATION,
  PIP_RADIUS,
  PIP_SLOTS,
  restingPoseDeclaration,
} from "./geometry.js";
export type { DiceThemeToken } from "./theme-tokens.js";
export { DICE_THEME_DEFAULTS } from "./theme-tokens.js";
export type { DieFaceArt } from "./art.js";
export { CUP_ART_HEIGHT, CUP_ART_WIDTH, DIE_FACE_ART_HEIGHT, DIE_FACE_ART_WIDTH, getCupArtUrl, getDieFaceArt, getDieFaceArtUrl } from "./art.js";
export { createDieSceneElement } from "./die.js";
export { DICE_STYLE_ID, buildDiceStylesheet, ensureDiceStyles } from "./dice-styles.js";
export { announceRoll, createDiceAnnouncer } from "./dice-announcer.js";
export type { DiceCupHandle, DiceCupOptions } from "./dice.js";
export { createDiceCup } from "./dice.js";
