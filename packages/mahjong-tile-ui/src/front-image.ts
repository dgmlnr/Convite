// This module RESOLVES art, it does not draw it. The 42 faces are shipped
// WebP rasterized from 碧海风's vector (`tools/process-svg-tiles.mjs`), so
// they are not CSS-themeable and are not meant to be: a face keeps its own
// fixed identity across every tenant, exactly like the deck's card fronts,
// while the body under it (`tile-body.ts`) is the themeable surface. See
// `about.ts` for the credit the artwork's license REQUIRES rather than
// merely invites.
import { tileId, type Dragon, type Flower, type Season, type Suit, type SuitRank, type Tile, type Wind } from "./tile.js";

// `../assets/tiles/` from either `src/front-image.ts` (dev/test, via Vitest's
// Node resolution of import.meta.url) or the compiled `dist/front-image.js`
// resolves to the same place: both `src/` and `dist/` sit exactly one
// directory below the package root, and the assets are checked into the repo
// rather than generated, so no build/copy step is needed for this to work.
// `static-tile-assets.ts` serves these exact on-disk files at
// `/assets/tiles/<tileId>.webp`, never a Vite-hashed build output filename.
//
// THE `new URL` CALL BELOW IS COPIED, NOT ADAPTED, from
// `spanish-deck-ui/src/front-image.ts:104-113`. That file's own header
// (`:29-55`) records TWO Vite failures in OPPOSITE directions, both found by
// the visual-regression suite actually fetching bytes rather than asserting
// on the src STRING, which stayed true either way:
//
// 1. A two-step form (a shared `new URL("../assets/tiles/", import.meta.url)`
//    base reused by a second `new URL(file, base)` call) is correct under
//    real Node and under `vite build`, and silently 404s EVERY file under
//    Vite's DEV SERVER — its static analysis only rewrites the pattern when
//    `import.meta.url` is the literal second argument of THAT exact call.
// 2. One call with a template literal fixes the dev server and breaks
//    production: at `vite build` Rollup's asset plugin reads the dynamic
//    template as a GLOB and bundles all 42 under hashed `dist-app/assets/`
//    names the real server never serves.
//
// `/* @vite-ignore */` opts the whole expression out of that analysis in both
// places at once, forcing genuine runtime resolution — the ONLY combination
// that works under real Node, Vite's dev server AND a real `vite build`. It
// is reproduced verbatim rather than improved.

/** Suit names are domain vocabulary and stay in Spanish, and they are PLURAL
 * because the label counts them: "3 de bambúes", not "3 de bambú" — which is
 * also what keeps the sticks suit (條) from sounding like the bamboo flower
 * (竹) when a screen reader says it out loud. */
const SUIT_LABELS: Record<Suit, string> = {
  circles: "círculos",
  bamboo: "bambúes",
  characters: "caracteres",
};

const WIND_LABELS: Record<Wind, string> = { east: "este", south: "sur", west: "oeste", north: "norte" };
const DRAGON_LABELS: Record<Dragon, string> = { red: "rojo", green: "verde", white: "blanco" };
const FLOWER_LABELS: Record<Flower, string> = { plum: "ciruelo", orchid: "orquídea", chrysanthemum: "crisantemo", bamboo: "bambú" };
const SEASON_LABELS: Record<Season, string> = { spring: "primavera", summer: "verano", autumn: "otoño", winter: "invierno" };

/**
 * The tile's name, in one language end to end (WCAG 3.1.2), because this
 * string is read aloud inside a `lang="es"` document. The deck learned this
 * the expensive way: "Ace of oro" mixed an English rank with a Spanish suit
 * and a Spanish screen reader pronounced "Ace" with Spanish phonemes,
 * producing a word that is no language at all.
 *
 * The four bonus tiles are prefixed ("flor de", "estación de") rather than
 * left bare, so eight distinct drawings stay eight distinct things a player
 * hears — and so the bamboo FLOWER never collides with the bamboo SUIT.
 */
export function tileLabel(tile: Tile): string {
  switch (tile.kind) {
    case "suit":
      return `${String(tile.rank satisfies SuitRank)} de ${SUIT_LABELS[tile.suit]}`;
    case "wind":
      return `viento ${WIND_LABELS[tile.wind]}`;
    case "dragon":
      return `dragón ${DRAGON_LABELS[tile.dragon]}`;
    case "flower":
      return `flor de ${FLOWER_LABELS[tile.flower]}`;
    case "season":
      return `estación de ${SEASON_LABELS[tile.season]}`;
  }
}

/**
 * On-demand URL for a face's artwork. Resolving this does NOT fetch any bytes
 * — it is pure string/URL arithmetic. The browser only fetches once the URL
 * is actually used, which is what makes loading genuinely on-demand: a board
 * shows 144 tiles drawn from at most 42 distinct files, and the browser's own
 * cache does the rest.
 */
export function getTileFrontUrl(tile: Tile): URL {
  return new URL(/* @vite-ignore */ `../assets/tiles/${tileId(tile)}.webp`, import.meta.url);
}

/**
 * The artwork's OWN pixel dimensions — every one of the 42 `.webp` faces is
 * exactly this, with no per-face variation, and `front-image.test.ts` asserts
 * that against the real files.
 *
 * DERIVED, AND THE DERIVATION IS FENCED TOO. The rule is the deck's
 * (`spanish-deck-ui/tools/process-svg-deck.mjs:25-29`): rasterize at ~2.7x
 * the largest width the artwork is ever DRAWN at. A board has no natural
 * largest width — it fills its container — so `geometry.ts` declares the cap,
 * and because this artwork IS the tile rather than something inset inside
 * one, the largest face width is that cap:
 *
 *     TILE_FRONT_WIDTH  = ceil(72 * 2.7)     = 195
 *     TILE_FRONT_HEIGHT = round(195 / 0.69882) = 279
 *
 * It is NOT 80. That figure came from applying the same rule to 29.5px, which
 * is the SMALLEST-container width a phone binds — the rule read backwards,
 * rasterizing for the smallest tile anybody ever sees.
 *
 * WRITTEN OUT RATHER THAN COMPUTED FROM THE CAP, and that is the whole
 * reason the derivation is testable. `Math.ceil(TILE_MAX_INLINE_SIZE *
 * TILE_RASTER_OVERSAMPLE)` here would be correct by construction, and the
 * fence next door would then be re-running production's own expression
 * against production's own values — green against any code, which is exactly
 * the tautology shape this change has already caught once. Declared, these
 * two numbers can disagree with the rule OR with the bytes, and there is a
 * fence for each.
 *
 * The uniformity is STRUCTURAL, not luck: the build tool rasterizes every
 * face from vector at one size. The deck's own docblock at `:128-141` is what
 * this arrangement exists to avoid — a dimension whose rationale outlived the
 * artwork it was measured from, because the only thing asserting it was a
 * comment.
 */
export const TILE_FRONT_WIDTH = 195;
export const TILE_FRONT_HEIGHT = 279;

export interface TileFrontImage {
  /** Ready to assign to an <img src> or a CSS background-image. */
  readonly src: string;
  /**
   * The artwork's real pixel box, so the box a browser reserves from these
   * attributes is the box the decoded image goes on to paint — no reflow on
   * load. Identical for all 42, so a board still aligns without any consumer
   * having to pin a ratio of its own.
   */
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

/** Face image descriptor for a tile, ready to back an `<img>` element. */
export function getTileArt(tile: Tile): TileFrontImage {
  return {
    src: getTileFrontUrl(tile).href,
    width: TILE_FRONT_WIDTH,
    height: TILE_FRONT_HEIGHT,
    alt: tileLabel(tile),
  };
}
