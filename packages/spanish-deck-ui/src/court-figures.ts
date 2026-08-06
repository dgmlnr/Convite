import type { Rank, Suit } from "./card.js";
import { suitSymbolMarkup } from "./suit-symbols.js";

// The 12 court cards (sota/caballo/rey x 4 suits) are the only genuinely
// hand-drawn cards in the deck. Rather than 12 independent illustrations,
// this is a template system: ONE standing-figure silhouette (shared by sota
// and rey), ONE mounted-figure silhouette (caballo), a per-rank accessory
// (cap+pennant / crown+scepter / nothing extra for the horse), and the suit's
// own accent color + chest badge. This is a deliberate style choice, not a
// shortcut forced by budget: bold, restrained silhouettes read far better at
// ~60px than an attempt at detailed portraiture would, and it keeps every
// court card visually consistent with the others.
//
// Local coordinate box for every figure: 0 0 140 220.
export type CourtRank = 10 | 11 | 12;

function chestBadge(suit: Suit): string {
  return `<g transform="translate(52,80) scale(0.36)">${suitSymbolMarkup(suit)}</g>`;
}

function standingBody(suit: Suit): string {
  const robe = `M46 62 L94 62 L110 190 Q70 202 30 190 Z`;
  return [
    `<circle cx="70" cy="34" r="20" fill="var(--deck-ink)" />`,
    `<rect x="62" y="50" width="16" height="14" fill="var(--deck-ink)" />`,
    `<path d="${robe}" fill="var(--deck-ink)" />`,
    `<path d="${robe}" fill="none" stroke="var(--deck-suit-${suit})" stroke-width="5" />`,
    `<line x1="34" y1="140" x2="106" y2="140" stroke="var(--deck-suit-${suit})" stroke-width="4" />`,
    chestBadge(suit),
  ].join("");
}

function sotaAccessory(suit: Suit): string {
  return [
    `<path d="M46 20 Q70 2 94 20 Q94 32 70 30 Q46 32 46 20 Z" fill="var(--deck-ink)" />`,
    `<line x1="118" y1="70" x2="118" y2="170" stroke="var(--deck-ink)" stroke-width="4" stroke-linecap="round" />`,
    `<path d="M118 70 L142 80 L118 90 Z" fill="var(--deck-suit-${suit})" />`,
  ].join("");
}

function reyAccessory(suit: Suit): string {
  return [
    `<path d="M48 20 L56 4 L70 16 L84 4 L92 20 Z" fill="var(--deck-ink)" stroke="var(--deck-suit-${suit})" stroke-width="2" />`,
    `<circle cx="118" cy="84" r="7" fill="var(--deck-suit-${suit})" />`,
    `<line x1="118" y1="90" x2="126" y2="170" stroke="var(--deck-ink)" stroke-width="4" stroke-linecap="round" />`,
  ].join("");
}

function caballoFigure(suit: Suit): string {
  return [
    `<path d="M10 130 Q2 150 14 168 Q26 152 20 128 Z" fill="var(--deck-ink)" />`,
    `<ellipse cx="70" cy="150" rx="58" ry="32" fill="var(--deck-ink)" />`,
    `<path d="M118 138 L140 100 L128 96 L106 128 Z" fill="var(--deck-ink)" />`,
    `<path d="M126 98 L132 90 L134 100 Z" fill="var(--deck-suit-${suit})" />`,
    `<rect x="26" y="170" width="10" height="40" rx="4" fill="var(--deck-ink)" />`,
    `<rect x="54" y="174" width="10" height="40" rx="4" fill="var(--deck-ink)" />`,
    `<rect x="86" y="174" width="10" height="40" rx="4" fill="var(--deck-ink)" />`,
    `<rect x="114" y="170" width="10" height="40" rx="4" fill="var(--deck-ink)" />`,
    `<circle cx="76" cy="84" r="15" fill="var(--deck-ink)" />`,
    `<path d="M58 98 L94 98 L102 138 Q76 146 50 138 Z" fill="var(--deck-ink)" />`,
    `<path d="M58 98 L94 98 L102 138 Q76 146 50 138 Z" fill="none" stroke="var(--deck-suit-${suit})" stroke-width="5" />`,
    `<line x1="100" y1="88" x2="134" y2="56" stroke="var(--deck-ink)" stroke-width="4" stroke-linecap="round" />`,
    `<path d="M134 56 L154 64 L134 70 Z" fill="var(--deck-suit-${suit})" />`,
  ].join("");
}

function sota(suit: Suit): string {
  return standingBody(suit) + sotaAccessory(suit);
}

function rey(suit: Suit): string {
  return standingBody(suit) + reyAccessory(suit);
}

const COURT_BUILDERS: Record<CourtRank, (suit: Suit) => string> = {
  10: sota,
  11: caballoFigure,
  12: rey,
};

/** Full court-figure markup, wrapped with a `data-court-figure` marker for tests/composition. */
export function courtFigureMarkup(suit: Suit, rank: Rank): string {
  const build = COURT_BUILDERS[rank as CourtRank];
  return `<g data-court-figure="${suit}">${build(suit)}</g>`;
}
