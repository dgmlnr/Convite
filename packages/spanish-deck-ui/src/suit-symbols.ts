import type { Suit } from "./card.js";

// Each symbol is hand-authored in a local 0 0 100 100 box, built from a
// handful of primitives (circle/rect/path), not autotraced from a raster
// image. Chosen for silhouette contrast first — a coin disk, a goblet, a
// blade and a club read apart from each other even in outline alone, which
// matters more at 60px than any single symbol's ornamental detail.
//
// `basto` and `espada` are traditionally drawn diagonally in the historic
// baraja; both are drawn vertically here instead, a deliberate simplification
// for legibility at game size — a rotated silhouette loses recognizable
// shape faster when scaled down than an upright one does.

function oro(): string {
  return [
    `<circle cx="50" cy="50" r="38" fill="var(--deck-suit-oro)" />`,
    `<circle cx="50" cy="50" r="38" fill="none" stroke="var(--deck-card-bg)" stroke-width="3" />`,
    `<circle cx="50" cy="50" r="24" fill="none" stroke="var(--deck-card-bg)" stroke-width="2" />`,
    `<path d="M50 38 L50 62 M38 50 L62 50 M42 42 L58 58 M58 42 L42 58" stroke="var(--deck-card-bg)" stroke-width="3" stroke-linecap="round" />`,
  ].join("");
}

function copa(): string {
  return [
    `<path d="M28 22 C28 42 34 54 50 54 C66 54 72 42 72 22 Z" fill="var(--deck-suit-copa)" />`,
    `<rect x="46" y="54" width="8" height="18" fill="var(--deck-suit-copa)" />`,
    `<ellipse cx="50" cy="78" rx="20" ry="6" fill="var(--deck-suit-copa)" />`,
    `<line x1="28" y1="22" x2="72" y2="22" stroke="var(--deck-card-bg)" stroke-width="3" stroke-linecap="round" />`,
  ].join("");
}

function espada(): string {
  return [
    `<path d="M47 12 L53 12 L56 62 L50 70 L44 62 Z" fill="var(--deck-suit-espada)" />`,
    `<rect x="34" y="60" width="32" height="8" rx="2" fill="var(--deck-suit-espada)" />`,
    `<circle cx="50" cy="80" r="7" fill="var(--deck-suit-espada)" />`,
    `<line x1="50" y1="16" x2="50" y2="58" stroke="var(--deck-card-bg)" stroke-width="2" stroke-linecap="round" />`,
  ].join("");
}

function basto(): string {
  return [
    `<path d="M50 10 C60 10 64 20 60 30 L54 70 L46 70 L40 30 C36 20 40 10 50 10 Z" fill="var(--deck-suit-basto)" />`,
    `<rect x="44" y="70" width="12" height="14" rx="3" fill="var(--deck-suit-basto)" />`,
    `<circle cx="43" cy="24" r="3" fill="var(--deck-card-bg)" />`,
    `<circle cx="56" cy="34" r="3" fill="var(--deck-card-bg)" />`,
    `<circle cx="45" cy="46" r="3" fill="var(--deck-card-bg)" />`,
  ].join("");
}

const SUIT_SYMBOLS: Record<Suit, () => string> = { oro, copa, espada, basto };

/** Raw SVG shape markup for a suit symbol, in a local 0 0 100 100 box. */
export function suitSymbolMarkup(suit: Suit): string {
  return SUIT_SYMBOLS[suit]();
}
