// Generates a fully self-contained static HTML page for VISUAL review of
// the deck artwork. Requires `tsc -b` to have run first (reads the built
// dist/index.js — this script itself is not part of the tsc project and is
// deliberately excluded from it).
//
// Card fronts are now real images (rasterized from Basquetteur's SVG deck), not generated SVG,
// so `<img>` src values here use a path RELATIVE to this sample file
// (../assets/fronts/<id>.webp) rather than `getCardArt(card).src` (an
// absolute file:// URL derived from the built package's own location) —
// the sample must keep working whether opened directly via file:// or
// served over local HTTP from the package root, and a relative path is the
// only one valid in both cases. Width/height/alt still come straight from
// the real `getCardArt` API, so this page also proves that function works.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ALL_CARDS, DECK_ATTRIBUTION, DECK_THEME_DEFAULTS, cardBackSvg, cardId, getCardArt } from "../dist/index.js";

const outPath = fileURLToPath(new URL("../sample/deck-sample.html", import.meta.url));

const SUIT_ORDER = ["oro", "copa", "espada", "basto"];
const RANK_ORDER = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

function orderedCards() {
  return SUIT_ORDER.flatMap((suit) => RANK_ORDER.map((rank) => ALL_CARDS.find((c) => c.suit === suit && c.rank === rank)));
}

function relativeFrontSrc(card) {
  return `../assets/fronts/${cardId(card)}.webp`;
}

function cardFigure(card, sizeClass) {
  const art = getCardArt(card);
  return [
    `<figure class="card ${sizeClass}">`,
    `<img src="${relativeFrontSrc(card)}" width="${art.width}" height="${art.height}" alt="${art.alt}" loading="lazy" />`,
    `<figcaption>${card.rank}-${card.suit}</figcaption>`,
    `</figure>`,
  ].join("");
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
  .map((c, i) => cardFigure(c, `size-hand hand-slot-${i}`))
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
  .card img { display: block; object-fit: contain; }
  .card figcaption { text-align: center; font-size: 11px; margin-top: 4px; opacity: 0.7; }
  .size-game img { width: 60px; height: auto; }
  .size-large img { width: 220px; height: auto; }
  .size-hand img { width: 160px; height: auto; }

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

  .about {
    max-width: 640px;
    margin-top: 24px;
    padding: 20px 24px;
    background: #f7ecd4;
    border: 1px solid #3a2b1a33;
    border-radius: 8px;
    font-size: 14px;
    line-height: 1.5;
  }
  .about h3 { margin-top: 0; }
  .about a { color: #7a1f2b; }
</style>
</head>
<body>
<h1>Spanish deck artwork — visual review</h1>
<p>Card fronts are Basquetteur's Spanish deck, CC BY-SA 3.0 (loaded on demand — see below).
The card back is our own SVG, still CSS-themeable via custom properties (defaults shown here).</p>

<h2>All 40 cards — game size (~60px wide, as seen in an actual hand)</h2>
<section class="grid">
${gameSizeRow}
</section>

<h2>All 40 cards — large size (native, ~220px wide)</h2>
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

<h2>About / attribution</h2>
<div class="about">
  <h3>${DECK_ATTRIBUTION.title}</h3>
  <p>${DECK_ATTRIBUTION.body}</p>
  <p><a href="${DECK_ATTRIBUTION.sourceUrl}">${DECK_ATTRIBUTION.sourceUrl}</a></p>
  <p>${DECK_ATTRIBUTION.licenseNote}</p>
</div>

</body>
</html>
`;

writeFileSync(outPath, html, "utf8");
console.log(`Wrote ${outPath} (${html.length} bytes)`);
