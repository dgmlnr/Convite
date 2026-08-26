#!/usr/bin/env node
// process-svg-deck.mjs — v1 (2026-08-25)
//
// Reproduces packages/spanish-deck-ui/assets/fronts/*.webp from their real
// source: the Spanish playing-card SVGs published at
// github.com/gjenkins20/spanish-playing-cards-svg, whose artwork is by
// Basquetteur on Wikimedia Commons and is licensed CC BY-SA 3.0. See
// ../src/about.ts / DECK_ATTRIBUTION for the credit this license REQUIRES,
// and ../assets/LICENSE for the license the derived files carry.
//
// This replaced the Fournier 1878 scans (process-fournier-deck.mjs, kept
// alongside: it still documents where the previous 40 binaries came from,
// and reverting is a real option). The reason for the swap was legibility at
// the sizes the game actually draws — flat, high-contrast line art reads at
// 60px in a way a photographed 1878 card does not.
//
// WHY IT RASTERIZES AT ALL, since the source is vector and shipping the SVG
// would scale to any size for free: measured, the 40 source files total
// 59.8 MB — 1.5 MB average, 4.4 MB for the as de oros alone. They are
// auto-traced from scans, not drawn, so the path data is enormous (63 paths
// carrying megabytes of coordinates). Sixty megabytes of SVG in a widget
// that loads over somebody else's network is not a trade, and neither is
// asking a phone to rasterize that per card. WebP at 329x520 costs 1.1 MB
// for the whole deck.
//
// AND WHY 329x520 AND NOT 2x. The largest card the game ever draws is 122px
// wide (`--truco-card-width` at the 1v1 fullscreen tier), so 329px is
// already 2.7x the biggest on-screen use and covers a 2x-density display
// with room to spare. A 658x1040 deck was built and measured at 2.2 MB: it
// buys pixels nothing displays.
//
// NO RETOUCH RECIPE, unlike the Fournier script. That one carried real
// editorial choices (levels, saturation, unsharp, crop) because it was
// rescuing a photograph. This source is already flat art with its own
// transparent rounded corners — every adjustment tested made it worse, so
// the recipe is the honest one: rasterize, and stop.
//
// Requires on PATH: git (for `fetch`), rsvg-convert, ImageMagick's `magick`.
// No new npm dependency, per this repo's own rule for tooling.
//
// Usage:
//   node tools/process-svg-deck.mjs fetch <dir>
//       Clones the upstream deck into <dir>. A shallow clone is enough;
//       nothing here depends on its history.
//
//   node tools/process-svg-deck.mjs build <dir>
//       Rasterizes the 40 cards this game uses out of <dir> and writes
//       assets/fronts/<rank>-<suit>.webp. Deliberately NOT wired into CI:
//       the committed WebP files are the artifact, and a build step that
//       silently re-derives binaries is how a deck drifts from its baselines.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const FRONTS_DIR = path.join(PACKAGE_ROOT, "assets", "fronts");

const UPSTREAM = "https://github.com/gjenkins20/spanish-playing-cards-svg.git";

/** Upstream names the suits in English; this package names them in Spanish. */
export const SUIT_MAP = { oro: "coins", copa: "cups", espada: "swords", basto: "clubs" };

/** The ranks a truco deck uses: no 8 or 9, and the courts are 10/11/12. */
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

/** Matches the previous deck's dimensions exactly, so this is a drop-in swap:
 * every pinned height and visual baseline moves for the ARTWORK or not at
 * all, never because a file changed shape underneath them. */
const WIDTH = 329;
const HEIGHT = 520;

function fetchUpstream(dir) {
  if (existsSync(dir)) throw new Error(`refusing to clone over an existing path: ${dir}`);
  execFileSync("git", ["clone", "--depth", "1", UPSTREAM, dir], { stdio: "inherit" });
}

function build(dir) {
  mkdirSync(FRONTS_DIR, { recursive: true });
  let written = 0;
  for (const [suit, upstreamSuit] of Object.entries(SUIT_MAP)) {
    for (const rank of RANKS) {
      const source = path.join(dir, `card_${upstreamSuit}_${String(rank).padStart(2, "0")}.svg`);
      if (!existsSync(source)) throw new Error(`missing source card: ${source}`);
      const dest = path.join(FRONTS_DIR, `${String(rank)}-${suit}.webp`);
      // Two processes rather than one: rsvg renders the vector honestly (and
      // keeps the source's own alpha), magick only encodes. Piping PNG
      // between them avoids a temp file and avoids asking either tool to do
      // the other's job badly.
      const png = execFileSync("rsvg-convert", ["-w", String(WIDTH), "-h", String(HEIGHT), "-f", "png", source], { maxBuffer: 64 * 1024 * 1024 });
      execFileSync("magick", ["png:-", "-quality", "90", dest], { input: png });
      written += 1;
    }
  }
  console.log(`wrote ${String(written)} cards to ${FRONTS_DIR}`);
}

const [command, target] = process.argv.slice(2);
if (command === "fetch" && target !== undefined) fetchUpstream(target);
else if (command === "build" && target !== undefined) build(target);
else {
  console.error("usage: process-svg-deck.mjs fetch <dir> | build <dir>");
  process.exit(1);
}
