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
// This replaced the Fournier 1878 scans, whose own build script has since
// been removed along with them. The reason for the swap was legibility at
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
// ONE REPAIR, AND IT IS NOT AN EDITORIAL CHOICE. The Fournier script carried
// real ones (levels, saturation, unsharp, crop) because it was rescuing a
// photograph; this source is flat art and needs none of that. What it does
// need is a background: 36 of the 40 cards ship with their face fill too
// NARROW, so roughly the right third of the card is transparent in the SVG
// itself — an upstream authoring bug, reproduced here at the source's own
// natural size and with the aspect ratio left alone, so it is not an artefact
// of these dimensions. On a green felt that band shows the table through the
// card.
//
// THE FILL HAS TO BE THE GRADIENT, not a colour, and a flat fill was tried
// first and rejected ON SIGHT: the face is not flat. It carries eight faint
// vertical bands running #ececec at the left edge to #fcfcfc around x=180,
// getting LIGHTER to the right — so any single colour poured into the gap
// lands next to a band it does not match and draws a visible line. A mid-tone
// (#f4f4f4) is worst of all: next to the #fcfcfc band it steps BACKWARDS, and
// a backwards step reads as an edge.
//
// So the repair rebuilds the background the art meant to have. The bands rise
// about 0.075 per pixel (240 at x=19 to 252 at x=180), which extrapolates to
// white at roughly x=220 — hence a gradient over the first 220px and flat
// white after it. Measured across the join on the worst card: 252, 253, 254,
// 255. Monotonic, in the direction the bands were already going, no step.
//
// It is also why the gap's own starting x does not matter, and that matters:
// it is NOT constant. It falls at x=211 on the as de espada and at x=46 on
// the doce de oro, so parts of some faces are missing well inside the card,
// not merely along the right edge. A gradient is right everywhere; a colour
// could only ever be right in one place.
//
// PNG24 IS LOAD-BEARING. ImageMagick builds `gradient:` in the Gray
// colorspace, and compositing a colour card onto a grayscale base silently
// produces a GRAYSCALE CARD — which is exactly what the first working version
// of this shipped, caught by looking at the output rather than by any
// measurement of it. Forcing 24-bit truecolor on the background, and 32-bit
// on the result, is what keeps the art in colour.
//
// CORNER_RADIUS is measured too: the face reaches the canvas edge by y=15 at
// this width. Filling without putting the corners back would square them off.
//
// If upstream ever fixes the fill, this step becomes a no-op rather than a
// distortion — it only ever touches pixels that are transparent.
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
/** Measured off the source: the face reaches the canvas edge by y=15 at
 * WIDTH=329, so the corner is ~4.6% of the width. Kept as a ratio so a change
 * of dimensions cannot silently square the corners. */
const CORNER_RADIUS = Math.round(WIDTH * 0.046);
/** Where the face's own banding, extrapolated, reaches white — see above. */
const GRADIENT_END = 220;

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
      execFileSync(
        "magick",
        [
          // The background the art meant to have: the banding's own ramp, then
          // white. Built rotated because `gradient:` runs top-to-bottom.
          "(", "-size", `${String(HEIGHT)}x${String(GRADIENT_END)}`, "gradient:#ffffff-#ececec", "-rotate", "90", ")",
          "(", "-size", `${String(WIDTH - GRADIENT_END)}x${String(HEIGHT)}`, "xc:white", ")",
          "+append",
          "-colorspace", "sRGB", "-type", "TrueColor",
          // The card over it. Everything the SVG actually drew wins; only the
          // upstream gaps take the background.
          "png:-", "-compose", "Over", "-composite",
          // Put the corners back — the composite above squared them off.
          "(", "-size", `${String(WIDTH)}x${String(HEIGHT)}`, "xc:none",
          "-fill", "white",
          "-draw", `roundrectangle 0,0 ${String(WIDTH - 1)},${String(HEIGHT - 1)} ${String(CORNER_RADIUS)},${String(CORNER_RADIUS)}`,
          "-alpha", "extract", ")",
          "-compose", "CopyOpacity", "-composite",
          "-quality", "90",
          `webp:${dest}`,
        ],
        { input: png },
      );
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
