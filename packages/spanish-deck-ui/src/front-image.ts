// The front artwork source changed from generated SVG (hand-drawn suit
// symbols composed into pips + court figures, see git history for
// card-svg.ts/suit-symbols.ts/court-figures.ts/pip-layout.ts) to real
// Heraclio Fournier 1878 scans, retouched and shipped as WebP files under
// `assets/fronts/`. This module resolves art, it no longer draws it — see
// `tools/process-fournier-deck.mjs` for the exact retouch recipe and
// `about.ts` for the attribution text this source change calls for.
//
// A direct consequence: fronts are no longer CSS-themeable (a raster
// photograph can't respond to a `--deck-suit-*` custom property). This is
// intentional, not a regression — the front keeps ITS OWN fixed identity
// across every tenant, while the back (still hand-drawn SVG, see
// card-back.ts) remains the tenant-themeable surface, per the "hybrid
// theming by zone" decision (obs 2955).
import { cardId, type Card, type Rank, type Suit } from "./card.js";
import { CARD_HEIGHT, CARD_WIDTH } from "./geometry.js";

// `../assets/fronts/` from either `src/front-image.ts` (dev/test, via
// Vitest's Node resolution of import.meta.url) or the compiled
// `dist/front-image.js` resolves to the same place: both `src/` and `dist/`
// sit exactly one directory below the package root, and the assets are
// checked into the repo directly rather than generated, so no build/copy
// step is needed for this to work.
const FRONTS_BASE_URL = new URL("../assets/fronts/", import.meta.url);

const RANK_LABELS: Record<Rank, string> = {
  1: "Ace",
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  // Court ranks keep their Spanish domain terms (project convention: sota,
  // caballo, rey are the actual names of these cards, not "Jack/Knight/King"
  // — there is no clean 1:1 English equivalent for a Spanish baraja).
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

/** Human-readable, accessible label for a card, e.g. "Ace of oro", "Rey of espada". */
export function cardLabel(card: Card): string {
  return `${RANK_LABELS[card.rank]} of ${SUIT_LABELS[card.suit]}`;
}

/**
 * On-demand URL for a card's front artwork. Resolving this does NOT fetch
 * any bytes — it is pure string/URL arithmetic. The browser only fetches the
 * image once this URL is actually used (e.g. assigned to an <img src>),
 * which is what makes loading genuinely on-demand: a 6-card hand triggers 6
 * requests, never the full 40-card, ~1MB deck.
 */
export function getCardFrontUrl(card: Card): URL {
  return new URL(`${cardId(card)}.webp`, FRONTS_BASE_URL);
}

export interface CardFrontImage {
  /** Ready to assign to an <img src> or a CSS background-image. */
  readonly src: string;
  /**
   * Logical display box, matching the real baraja española aspect ratio
   * (~0.655) — NOT each WebP's native pixel size. Native width varies
   * slightly per scan (321-329px at a fixed 520px height, since each source
   * scan was trimmed independently before resizing). Render with
   * `object-fit: contain` inside a box of this ratio, rather than relying on
   * each image's own intrinsic size, so every card in a hand aligns.
   */
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

/** Front-face image descriptor for a card, ready to back an <img> element. */
export function getCardArt(card: Card): CardFrontImage {
  return {
    src: getCardFrontUrl(card).href,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alt: cardLabel(card),
  };
}
