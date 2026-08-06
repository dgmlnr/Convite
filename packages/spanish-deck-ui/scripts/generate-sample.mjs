// Generates a fully self-contained static HTML page (no runtime JS module
// imports, so it opens directly from the filesystem in any browser) for
// VISUAL review of the deck artwork. Requires `tsc -b` to have run first
// (reads the built dist/index.js — this script itself is not part of the
// tsc project and is deliberately excluded from it).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ALL_CARDS,
  DECK_THEME_DEFAULTS,
  cardBackSvg,
  getCardArt,
} from "../dist/index.js";

const outPath = fileURLToPath(new URL("../sample/deck-sample.html", import.meta.url));

const SUIT_ORDER = ["oro", "copa", "espada", "basto"];
const RANK_ORDER = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

function orderedCards() {
  return SUIT_ORDER.flatMap((suit) => RANK_ORDER.map((rank) => ALL_CARDS.find((c) => c.suit === suit && c.rank === rank)));
}

function cardFigure(card, sizeClass) {
  return `<figure class="card ${sizeClass}">${getCardArt(card)}<figcaption>${card.rank}-${card.suit}</figcaption></figure>`;
}

const gameSizeRow = orderedCards()
  .map((c) => cardFigure(c, "size-game"))
  .join("\n");

const largeSizeRow = orderedCards()
  .map((c) => cardFigure(c, "size-large"))
  .join("\n");

const handCards = [
  ALL_CARDS.find((c) => c.suit === "espada" && c.rank === 1),
  ALL_CARDS.find((c) => c.suit === "oro" && c.rank === 12),
  ALL_CARDS.find((c) => c.suit === "copa" && c.rank === 7),
];

const handMarkup = handCards
  .map(
    (c, i) =>
      `<figure class="card size-hand hand-slot-${i}">${getCardArt(c)}<figcaption>${c.rank}-${c.suit}</figcaption></figure>`,
  )
  .join("\n");

const rootVars = Object.entries(DECK_THEME_DEFAULTS)
  .map(([k, v]) => `  ${k}: ${v};`)
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Spanish deck artwork — visual review</title>
<style>
  :root {
${rootVars}
  }
  body {
    margin: 0;
    padding: 32px;
    background: #e9e2d0;
    font-family: system-ui, sans-serif;
    color: #241a10;
  }
  h1 { margin-top: 0; }
  h2 { margin-top: 48px; border-bottom: 2px solid #3a2b1a33; padding-bottom: 8px; }
  section.grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-end;
  }
  .card svg { display: block; }
  .card figcaption { text-align: center; font-size: 11px; margin-top: 4px; opacity: 0.7; }
  .size-game svg { width: 60px; }
  .size-large svg { width: 220px; }
  .size-hand svg { width: 160px; }

  .backs-row { display: flex; gap: 40px; }
  .back-theme {
    padding: 24px;
    border-radius: 12px;
  }
  .back-theme svg { width: 160px; display: block; }
  .theme-default { background: #cfc6ad; }
  .theme-brandA {
    background: #1a1440;
    --deck-back-bg: #1a1440;
    --deck-back-accent: #ff8a3d;
  }
  .theme-brandB {
    background: #f4f4f4;
    --deck-back-bg: #ffffff;
    --deck-back-accent: #0f7b6c;
  }

  .table {
    background: #1e4d3a;
    border-radius: 16px;
    padding: 40px;
    display: flex;
    justify-content: center;
  }
  .hand {
    position: relative;
    height: 260px;
    width: 420px;
  }
  .hand .card { position: absolute; bottom: 0; }
  .hand .hand-slot-0 { left: 30px; transform: rotate(-8deg); }
  .hand .hand-slot-1 { left: 130px; transform: rotate(0deg); z-index: 1; }
  .hand .hand-slot-2 { left: 230px; transform: rotate(8deg); }
</style>
</head>
<body>
<h1>Spanish deck artwork — visual review</h1>
<p>All colors are CSS custom properties (defaults shown here); no card front or back has a hardcoded color literal.</p>

<h2>All 40 cards — game size (~60px wide, as seen in an actual hand)</h2>
<section class="grid">
${gameSizeRow}
</section>

<h2>All 40 cards — large size (native, 220px wide)</h2>
<section class="grid">
${largeSizeRow}
</section>

<h2>Card back — themeable, two tenant brand examples</h2>
<div class="backs-row">
  <div class="back-theme theme-default"><p>Default</p>${cardBackSvg()}</div>
  <div class="back-theme theme-brandA"><p>Tenant brand A (indigo/orange)</p>${cardBackSvg()}</div>
  <div class="back-theme theme-brandB"><p>Tenant brand B (white/teal)</p>${cardBackSvg()}</div>
</div>

<h2>Mock hand — three cards as a player actually sees them</h2>
<div class="table">
  <div class="hand">
${handMarkup}
  </div>
</div>

</body>
</html>
`;

writeFileSync(outPath, html, "utf8");
console.log(`Wrote ${outPath} (${html.length} bytes)`);
