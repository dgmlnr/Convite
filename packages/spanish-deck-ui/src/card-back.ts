import { CARD_BORDER_INSET, CARD_HEIGHT, CARD_RADIUS, CARD_VIEWBOX, CARD_WIDTH } from "./geometry.js";

// The back is deliberately its own module with zero imports from the suit or
// court art: this is what "separable" means in practice, not just a claim.
// It's the tenant-themeable surface (obs 2955) — always on screen (it's the
// opponent's hand), never touching front legibility. A lattice of diagonal
// lines is generated rather than hand-listed coordinate by coordinate, to
// keep this file small while still being genuinely hand-authored (a
// procedure, not an autotrace).
function latticeLines(): string {
  const lines: string[] = [];
  const step = 24;
  for (let x = -CARD_HEIGHT; x < CARD_WIDTH + CARD_HEIGHT; x += step) {
    lines.push(`M${x} 0 L${x + CARD_HEIGHT} ${CARD_HEIGHT}`);
  }
  return `<path d="${lines.join(" ")}" stroke="var(--deck-back-accent)" stroke-width="1.5" opacity="0.35" clip-path="url(#deck-back-clip)" />`;
}

export function cardBackSvg(): string {
  const inset = CARD_BORDER_INSET;
  return [
    `<svg viewBox="${CARD_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">`,
    `<defs><clipPath id="deck-back-clip"><rect x="${inset}" y="${inset}" width="${CARD_WIDTH - inset * 2}" height="${CARD_HEIGHT - inset * 2}" rx="${CARD_RADIUS}" /></clipPath></defs>`,
    `<rect x="${inset}" y="${inset}" width="${CARD_WIDTH - inset * 2}" height="${CARD_HEIGHT - inset * 2}" rx="${CARD_RADIUS}" fill="var(--deck-back-bg)" stroke="var(--deck-back-accent)" stroke-width="4" />`,
    latticeLines(),
    `<rect x="18" y="18" width="${CARD_WIDTH - 36}" height="${CARD_HEIGHT - 36}" rx="8" fill="none" stroke="var(--deck-back-accent)" stroke-width="2" opacity="0.8" />`,
    `<circle cx="${CARD_WIDTH / 2}" cy="${CARD_HEIGHT / 2}" r="34" fill="none" stroke="var(--deck-back-accent)" stroke-width="3" />`,
    `<circle cx="${CARD_WIDTH / 2}" cy="${CARD_HEIGHT / 2}" r="18" fill="var(--deck-back-accent)" opacity="0.9" />`,
    `</svg>`,
  ].join("");
}
