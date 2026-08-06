import type { Card } from "./card.js";
import { courtFigureMarkup } from "./court-figures.js";
import { CARD_HEIGHT, CARD_RADIUS, CARD_VIEWBOX, CARD_WIDTH } from "./geometry.js";
import { PIP_LAYOUTS, pipScaleForRank, type NumeralRank } from "./pip-layout.js";
import { suitSymbolMarkup } from "./suit-symbols.js";

const COURT_LABEL: Record<10 | 11 | 12, string> = { 10: "S", 11: "C", 12: "R" };

function rankLabel(card: Card): string {
  return card.rank >= 10 ? COURT_LABEL[card.rank as 10 | 11 | 12] : String(card.rank);
}

function cornerIndexMarkup(card: Card): string {
  const label = rankLabel(card);
  const suitIcon = suitSymbolMarkup(card.suit);
  return [
    `<g data-corner-index="${card.suit}">`,
    `<text x="0" y="20" font-family="Georgia, 'Times New Roman', serif" font-size="26" font-weight="700" fill="var(--deck-ink)">${label}</text>`,
    `<g transform="translate(0,26) scale(0.22)">${suitIcon}</g>`,
    `</g>`,
  ].join("");
}

function pipsMarkup(card: Card): string {
  const layout = PIP_LAYOUTS[card.rank as NumeralRank];
  const scale = pipScaleForRank(card.rank as NumeralRank);
  const half = (100 * scale) / 2;
  const suitIcon = suitSymbolMarkup(card.suit);
  return layout
    .map(
      (pip) =>
        `<g data-pip="${card.suit}" transform="translate(${pip.x - half},${pip.y - half}) scale(${scale})">${suitIcon}</g>`,
    )
    .join("");
}

function isCourtRank(rank: Card["rank"]): rank is 10 | 11 | 12 {
  return rank === 10 || rank === 11 || rank === 12;
}

/** Composes the full front SVG for a card: frame + corner indices + (pips or the hand-drawn court figure). */
export function composeCardSvg(card: Card): string {
  const inset = 4;
  const frame = `<rect x="${inset}" y="${inset}" width="${CARD_WIDTH - inset * 2}" height="${CARD_HEIGHT - inset * 2}" rx="${CARD_RADIUS}" fill="var(--deck-card-bg)" stroke="var(--deck-border)" stroke-width="4" />`;

  // y=66, not 54: leaves clearance between the corner index (bottom ~62) and
  // the court figure's head/crown (top ~14 in its local box) so a king's
  // crown never collides with the corner rank letter above it.
  const body = isCourtRank(card.rank)
    ? `<g transform="translate(40,66)">${courtFigureMarkup(card.suit, card.rank)}</g>`
    : pipsMarkup(card);

  const topLeftIndex = `<g transform="translate(18,14)">${cornerIndexMarkup(card)}</g>`;
  const bottomRightIndex = `<g transform="translate(${CARD_WIDTH},${CARD_HEIGHT}) rotate(180) translate(18,14)">${cornerIndexMarkup(card)}</g>`;

  return [
    `<svg viewBox="${CARD_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">`,
    frame,
    body,
    topLeftIndex,
    bottomRightIndex,
    `</svg>`,
  ].join("");
}
