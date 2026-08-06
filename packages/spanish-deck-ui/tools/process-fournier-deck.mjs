#!/usr/bin/env node
// process-fournier-deck.mjs — v1 (2026-08-06)
//
// Reproduces packages/spanish-deck-ui/assets/fronts/*.webp from their real
// source: Heraclio Fournier's 1878 Spanish playing-card deck, held by the
// Fournier Museum of Playing Cards (Vitoria-Gasteiz, Spain), digitized on
// Wikimedia Commons — category "Heraclio Fournier's 1878 card deck",
// PUBLIC DOMAIN (see ../src/about.ts / DECK_ATTRIBUTION for the license
// text, verified on the individual Commons file pages).
//
// This script documents provenance so the 40 committed WebP files are not
// unexplained binaries. It is NOT wired into CI and does not run
// automatically: the retouch recipe below embeds real editorial choices the
// user made by comparing multiple variants (see the comment on
// RETOUCH_ARGS), so re-running it is a deliberate, occasional act, not a
// build step that should silently re-derive different output on every run.
//
// Requires on PATH: curl, jq (for `list`), ImageMagick's `magick` (for
// `process`). Node itself needs no extra dependency — this repo enforces
// "prefer zero new npm dependencies", and shelling out to already-installed
// system tools keeps that true for tooling too.
//
// Usage:
//   node tools/process-fournier-deck.mjs list
//       Lists every file title in the Commons category. Commons source
//       titles do not follow one single mechanical filename pattern across
//       all 40+ files in the category, so pairing a title to a rank/suit is
//       a manual, one-time step using RANK_MAP/SUIT_MAP below — this script
//       does not guess it.
//
//   node tools/process-fournier-deck.mjs url "<Commons file title>"
//       Resolves one Commons file title to its full-resolution source image
//       URL, ready to download (e.g. with `curl -o source.png <url>`).
//
//   node tools/process-fournier-deck.mjs process <source-image> <rank> <suit>
//       Applies the exact retouch recipe to one already-downloaded source
//       image and writes assets/fronts/<rank>-<suit>.webp.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const FRONTS_DIR = path.join(PACKAGE_ROOT, "assets", "fronts");

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
// The category's apostrophe is the TYPOGRAPHIC U+2019, not an ASCII "'" —
// the ASCII form 404s. Kept pre-percent-encoded here for exactly that
// reason (obs 2961/2962).
const COMMONS_CATEGORY = "Heraclio_Fournier%E2%80%99s_1878_card_deck";

/** Basque (Euskera) rank word -> this package's Rank. Commons files use these names. */
export const RANK_MAP = {
  bateko: 1,
  biko: 2,
  hiruko: 3,
  lauko: 4,
  bosteko: 5,
  seiko: 6,
  zazpiko: 7,
  txota: 10, // sota
  zaldi: 11, // caballo
  errege: 12, // rey
};

/** Basque suit word -> this package's Suit. */
export const SUIT_MAP = {
  urrea: "oro",
  kopa: "copa",
  ezpata: "espada",
  bastoia: "basto",
};

// "Atzealdea" (the original Fournier back) is deliberately never mapped or
// downloaded here: this project's card back is its own tenant-themeable SVG
// (../src/card-back.ts), not derived from the Fournier scan — see obs 2955.

function fetchJson(url) {
  const raw = execFileSync("curl", ["-sS", url], { encoding: "utf8" });
  return JSON.parse(raw);
}

/** Lists every file title in the Commons category (40 fronts + 1 back + misc). */
export function listSourceTitles() {
  const url = `${COMMONS_API}?action=query&list=categorymembers&cmtitle=Category:${COMMONS_CATEGORY}&cmlimit=500&format=json`;
  return fetchJson(url).query.categorymembers.map((member) => member.title);
}

/** Resolves one Commons file title to its full-resolution source image URL. */
export function resolveSourceUrl(title) {
  const url = `${COMMONS_API}?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&format=json`;
  const pages = Object.values(fetchJson(url).query.pages);
  return pages[0]?.imageinfo?.[0]?.url;
}

/**
 * Applies the EXACT retouch recipe the user chose after comparing 4 tone
 * variants and 3 crop/corner-radius combinations (obs 2962):
 *   - `-level 20%,82%` + `-modulate 106,132,100`: strips the aged-paper
 *     yellow cast and lifts saturation — the MOST AGGRESSIVE of 4 tested
 *     variants (original / soft / medium / aggressive), chosen deliberately
 *     so the deck reads as vivid, not degraded or antique.
 *   - `-shave 2%` + a 4%-radius rounded-corner alpha mask: the SOFTEST of 3
 *     tested crop/radius combinations, chosen over the medium option this
 *     agent originally recommended — the user's stated reasoning was more
 *     margin retained and a subtler, more elegant corner.
 *   - `-resize x520`: roughly 2x the largest on-screen use (game-size hand
 *     + native ~220px display), never full source resolution — this is what
 *     keeps the 40-card deck at ~1MB total instead of the ~72MB raw-scan
 *     baseline this replaced (obs 2960/2961).
 */
const RETOUCH_ARGS = [
  "-fuzz",
  "22%",
  "-trim",
  "+repage",
  "-level",
  "20%,82%",
  "-modulate",
  "106,132,100",
  "-unsharp",
  "0x1+0.6+0.02",
  "-shave",
  "%[fx:int(w*0.02)]x%[fx:int(w*0.02)]",
  "+repage",
  "-resize",
  "x520",
  "(",
  "+clone",
  "-alpha",
  "transparent",
  "-background",
  "none",
  "-fill",
  "white",
  "-draw",
  "roundrectangle 0,0 %[fx:w-1],%[fx:h-1] %[fx:w*0.04],%[fx:w*0.04]",
  ")",
  "-compose",
  "DstIn",
  "-composite",
  "-quality",
  "82",
  "-define",
  "webp:alpha-quality=90",
];

/** Runs the retouch recipe over one source image, writing `<rank>-<suit>.webp`. */
export function processOne(sourcePath, rank, suit) {
  const dest = path.join(FRONTS_DIR, `${rank}-${suit}.webp`);
  mkdirSync(FRONTS_DIR, { recursive: true });
  execFileSync("magick", [sourcePath, ...RETOUCH_ARGS, dest], { stdio: "inherit" });
  return dest;
}

function printUsage() {
  console.log(
    [
      "process-fournier-deck.mjs — reproduce assets/fronts/*.webp from Commons sources",
      "",
      "  list                                    list every Commons category file title",
      "  url \"<Commons file title>\"               resolve a title to its source image URL",
      "  process <source-image> <rank> <suit>    apply the exact retouch recipe",
      "",
      "See the file header for RANK_MAP/SUIT_MAP and the full recipe rationale.",
    ].join("\n"),
  );
}

function main() {
  const [, , cmd, ...args] = process.argv;

  if (cmd === "list") {
    for (const title of listSourceTitles()) {
      console.log(title);
    }
    return;
  }

  if (cmd === "url") {
    const [title] = args;
    if (!title) {
      printUsage();
      process.exitCode = 1;
      return;
    }
    console.log(resolveSourceUrl(title));
    return;
  }

  if (cmd === "process") {
    const [sourcePath, rank, suit] = args;
    if (!sourcePath || !rank || !suit) {
      printUsage();
      process.exitCode = 1;
      return;
    }
    const dest = processOne(sourcePath, Number(rank), suit);
    console.log(`Wrote ${dest}`);
    return;
  }

  printUsage();
  process.exitCode = cmd ? 1 : 0;
}

// Only run when invoked directly (`node tools/process-fournier-deck.mjs ...`),
// not when imported — e.g. a future test could import RANK_MAP/SUIT_MAP/
// processOne without triggering a CLI run.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
