// This module RESOLVES art, it does not draw it — the identical split
// `mahjong-tile-ui/front-image.ts` and `spanish-deck-ui/front-image.ts`
// already draw for their own shipped raster. The six die faces and the
// cup are WebP rendered from Blender (`../tools/render-props.py`), so they
// are not CSS-themeable and are not meant to be: a face keeps its own
// fixed identity across every tenant, exactly like the tile's and the
// deck's own card fronts. See `../assets/LICENSE` for why none of this
// carries an attribution obligation.
import type { DieFace } from "./geometry.js";

// `../assets/dice/<face>.webp` and `../assets/cup.webp` resolve identically
// from either `src/art.ts` (dev/test, via Vitest's Node resolution of
// import.meta.url) or the compiled `dist/art.js` (`src/` and `dist/` sit
// exactly one directory below the package root), and the assets are
// checked into the repo rather than generated at build time, so no
// copy step is needed for this to work.
//
// THE `new URL` CALL BELOW IS COPIED, NOT ADAPTED, from
// `mahjong-tile-ui/front-image.ts` (itself copied from
// `spanish-deck-ui/front-image.ts:104-113`). That file's own header
// records TWO Vite failures in OPPOSITE directions, both found by the
// visual-regression suite actually fetching bytes rather than asserting on
// the src STRING:
//
// 1. A two-step form (a shared `new URL("../assets/", import.meta.url)`
//    base reused by a second `new URL(file, base)` call) is correct under
//    real Node and under `vite build`, and silently 404s EVERY file under
//    Vite's DEV SERVER — its static analysis only rewrites the pattern when
//    `import.meta.url` is the literal second argument of THAT exact call.
// 2. One call with a template literal fixes the dev server and breaks
//    production: at `vite build` Rollup's asset plugin reads the dynamic
//    template as a GLOB and bundles all faces under hashed `dist-app/assets/`
//    names the real server never serves.
//
// `/* @vite-ignore */` opts the whole expression out of that analysis in
// both places at once, forcing genuine runtime resolution — the ONLY
// combination that works under real Node, Vite's dev server AND a real
// `vite build`. Reproduced verbatim rather than improved.

/**
 * On-demand URL for a die face's artwork. Resolving this does NOT fetch any
 * bytes — it is pure string/URL arithmetic, same contract as
 * `getTileFrontUrl`.
 */
export function getDieFaceArtUrl(face: DieFace): URL {
  return new URL(/* @vite-ignore */ `../assets/dice/${String(face)}.webp`, import.meta.url);
}

/** On-demand URL for the cubilete's artwork. */
export function getCupArtUrl(): URL {
  return new URL(/* @vite-ignore */ `../assets/cup.webp`, import.meta.url);
}

/**
 * THE ARTWORK'S OWN PIXEL DIMENSIONS. `art.test.ts` asserts these against
 * the real files, the same fence `TILE_FRONT_WIDTH`/`-HEIGHT` carries.
 *
 * DERIVED, AND THE DERIVATION IS FENCED TOO — `../tools/render-props.py`'s
 * own comment has the full rule (the deck's ~2.7x-oversample idiom,
 * `process-svg-deck.mjs:25-29`, applied to the largest on-screen box each
 * artwork is actually drawn at: `.hexdev-dice-scene`'s 110px for the die,
 * `.hexdev-dice-cup`'s 84x99 for the cup):
 *
 *     DIE_FACE_ART_WIDTH  = ceil(110 * 2.7)               = 297 (square)
 *     CUP_ART_WIDTH       = ceil(84 * 2.7)                = 228
 *     CUP_ART_HEIGHT      = round(228 / (100 / 118))      = 269
 *
 * Written out rather than computed from the on-screen box here, for the
 * identical reason `TILE_FRONT_WIDTH` is: a expression that re-derives its
 * own fence's expected value is green against any renumbering, which
 * defeats the fence.
 */
export const DIE_FACE_ART_WIDTH = 297;
export const DIE_FACE_ART_HEIGHT = 297;
export const CUP_ART_WIDTH = 228;
export const CUP_ART_HEIGHT = 269;

export interface DieFaceArt {
  /** Ready to assign to an <img src>. */
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

/**
 * Face image descriptor for a die, ready to back an `<img>` element. The
 * `alt` names the face by its number — a die's pip count IS the
 * information, unlike a mahjong tile's illustrated glyph, so there is no
 * separate vocabulary to translate the way `tileLabel` needs.
 */
export function getDieFaceArt(face: DieFace): DieFaceArt {
  return {
    src: getDieFaceArtUrl(face).href,
    width: DIE_FACE_ART_WIDTH,
    height: DIE_FACE_ART_HEIGHT,
    alt: `Cara ${String(face)}`,
  };
}
