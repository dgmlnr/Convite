// The front artwork has been three things. It started as generated SVG
// (hand-drawn suit symbols composed into pips + court figures, see git
// history for card-svg.ts/suit-symbols.ts/court-figures.ts/pip-layout.ts);
// then real Heraclio Fournier 1878 scans, retouched
// (by a build script removed with them); and now
// Basquetteur's Spanish deck, rasterized from vector
// (`tools/process-svg-deck.mjs`). The swap was for legibility at the sizes
// the game actually draws — flat, high-contrast line art reads at 60px in a
// way a photographed 1878 card does not. See `about.ts` for the credit,
// which the current artwork's license REQUIRES rather than merely invites.
//
// This module resolves art, it does not draw it, and that has not changed
// across any of the three: fronts are not CSS-themeable, because a shipped
// raster cannot respond to a `--deck-suit-*` custom property. Intentional,
// not a regression — the front keeps ITS OWN fixed identity across every
// tenant, while the back (still hand-drawn SVG, see card-back.ts) remains
// the tenant-themeable surface, per the "hybrid theming by zone" decision
// (obs 2955).
import { cardId, type Card, type Rank, type Suit } from "./card.js";

// `../assets/fronts/` from either `src/front-image.ts` (dev/test, via
// Vitest's Node resolution of import.meta.url) or the compiled
// `dist/front-image.js` resolves to the same place: both `src/` and `dist/`
// sit exactly one directory below the package root, and the assets are
// checked into the repo directly rather than generated, so no build/copy
// step is needed for this to work — `static-deck-assets.ts` (apps/server)
// serves these exact on-disk files at `/assets/fronts/<cardId>.webp`, never
// a Vite-hashed build output filename.
//
// TWO Vite pitfalls fought here, in opposite directions, both found by the
// visual-regression suite (`pnpm test:visual`) actually fetching the bytes —
// no prior test did, they only asserted the `src` STRING contained the
// filename, which stayed true either way:
//
// 1. A two-step version of this file (a shared `new URL("../assets/fronts/",
//    import.meta.url)` base, reused by a second `new URL(file, base)` call)
//    was correct under real Node and under `vite build`, but silently 404'd
//    EVERY card under Vite's DEV-SERVER serving — its static
//    `new URL(url, import.meta.url)` asset analysis only rewrites the
//    pattern correctly when `import.meta.url` is the literal second argument
//    of THAT exact call.
// 2. Combining both into ONE call with a template literal
//    (`` new URL(`../assets/fronts/${cardId(card)}.webp`, import.meta.url) ``)
//    fixes the dev-server case, but at `vite build` time Rollup's asset
//    plugin treats the dynamic template literal as a GLOB, bundling all 40
//    card fronts under hashed `dist-app/assets/` filenames the real server
//    never serves — breaking production (`pnpm test:e2e` 404s) while fixing
//    dev-server.
//
// `/* @vite-ignore */` (below) opts the whole expression OUT of Vite's
// static analysis in both places at once, forcing genuine runtime
// `new URL()` resolution — the ONLY combination that resolves correctly
// under real Node, Vite's dev server, AND a real `vite build`.
// preserves). Caught by the visual-regression suite's own asset-loading
// wait, not by any prior test.

// WCAG 3.1.2 (B8). This map used to mix languages — English rank words joined
// to Spanish suit names by an English "of" ("Ace of oro"). It ships as an
// `<img alt>` inside a `lang="es"` document, so a Spanish screen reader
// pronounces "Ace"/"of" with Spanish phonemes and produces a word that is no
// language at all. The court ranks were already right and stayed; the numerals
// and the connective are what changed.
//
// DIGITS for the plain numerals, "As" for the ace: this is the vocabulary
// `truco-ui`'s own SENA_LABELS already speaks to the same players ("As de
// espada", "7 de oro"), and the two must agree word for word or the product
// names one card two ways. Digits also stay honest without a
// numbers-to-words table, exactly the argument TABLE_STRINGS.scoreTotal makes.
const RANK_LABELS: Record<Rank, string> = {
  1: "As",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  // Court ranks are the actual names of these cards, not "Jack/Knight/King" —
  // there is no clean 1:1 English equivalent for a Spanish baraja, which is
  // why these three were already Spanish before the rest caught up.
  10: "Sota",
  11: "Caballo",
  12: "Rey",
};

// Suit names are domain vocabulary and stay in Spanish per the language
// contract; kept as an explicit map (rather than reusing the suit literal
// directly) so a future non-1:1 label change doesn't have to touch callers.
const SUIT_LABELS: Record<Suit, string> = {
  oro: "oro",
  copa: "copa",
  espada: "espada",
  basto: "basto",
};

/** The card's real Spanish name, e.g. "As de oro", "Rey de espada", "4 de
 * basto" — one language end to end (WCAG 3.1.2), because this string is read
 * aloud inside a `lang="es"` document. Game-agnostic despite matching truco's
 * own señas vocabulary: "As de oro" is what the card is called at any table
 * that uses a baraja española, not a truco term. */
export function cardLabel(card: Card): string {
  return `${RANK_LABELS[card.rank]} de ${SUIT_LABELS[card.suit]}`;
}

/**
 * On-demand URL for a card's front artwork. Resolving this does NOT fetch
 * any bytes — it is pure string/URL arithmetic. The browser only fetches the
 * image once this URL is actually used (e.g. assigned to an <img src>),
 * which is what makes loading genuinely on-demand: a 6-card hand triggers 6
 * requests, never the full 40-card, ~1MB deck.
 */
export function getCardFrontUrl(card: Card): URL {
  return new URL(/* @vite-ignore */ `../assets/fronts/${cardId(card)}.webp`, import.meta.url);
}

/**
 * The front artwork's OWN pixel dimensions — every one of the 40 `.webp`
 * fronts is exactly this, with no per-card variation.
 *
 * Deliberately NOT `CARD_WIDTH`/`CARD_HEIGHT` (geometry.ts, 220x336). Those
 * are the card BACK's SVG viewBox, and they correctly describe the real
 * baraja española (~57x87mm, ratio ~0.655). The front is a raster of
 * someone else's vector and lands on ratio ~0.633 instead. Declaring the
 * back's ratio on the front's `<img>` made the browser reserve a box the
 * artwork does not fill, so any consumer that lets height follow the
 * intrinsic ratio (`height: auto`) reserved one box before the bytes
 * arrived and a different one after decode.
 *
 * The uniformity is STRUCTURAL, not luck: `tools/process-svg-deck.mjs`
 * rasterizes every card from vector at one hardcoded size. The artwork this
 * docblock replaced was scanned, and scans really did vary per card
 * (321-329px wide at a fixed 520px height, each trimmed independently), so
 * a single declared box was the only thing that could align a hand back
 * then. That premise died with the scans — but the comment describing it
 * outlived them, and a stale rationale is why nobody re-derived the number
 * when the artwork underneath it changed shape.
 *
 * These are asserted against the real files on disk, all 40, by
 * front-image.test.ts. If the artwork is ever replaced again, that fence
 * fails rather than this comment quietly going stale a second time; and if
 * a future deck genuinely varies per card, the fence is where you will find
 * out, because a single declared box will stop being derivable at all.
 */
export const CARD_FRONT_WIDTH = 329;
export const CARD_FRONT_HEIGHT = 520;

export interface CardFrontImage {
  /** Ready to assign to an <img src> or a CSS background-image. */
  readonly src: string;
  /**
   * The artwork's real pixel box (`CARD_FRONT_WIDTH`x`CARD_FRONT_HEIGHT`),
   * so the box a browser reserves from these attributes is the same box the
   * decoded image goes on to paint — no reflow on load. Identical for all
   * 40 cards, so a hand still aligns without any consumer having to pin a
   * ratio of its own.
   */
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

/** Front-face image descriptor for a card, ready to back an <img> element. */
export function getCardArt(card: Card): CardFrontImage {
  return {
    src: getCardFrontUrl(card).href,
    width: CARD_FRONT_WIDTH,
    height: CARD_FRONT_HEIGHT,
    alt: cardLabel(card),
  };
}
