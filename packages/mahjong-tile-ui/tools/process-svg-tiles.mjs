#!/usr/bin/env node
// process-svg-tiles.mjs — v1 (2026-08-31)
//
// Reproduces packages/mahjong-tile-ui/assets/tiles/*.webp from their real
// source: the 42 mahjong tile faces published on Wikimedia Commons by
// 碧海风, all of them CC BY-SA 4.0. See ../src/about.ts / TILE_ATTRIBUTION
// for the credit that license REQUIRES, and ../assets/LICENSE for the
// license the derived files carry.
//
// Structurally this is `spanish-deck-ui/tools/process-svg-deck.mjs`: two
// stages (rsvg-convert renders the vector honestly, magick only encodes),
// no new npm dependency, and deliberately NOT wired into CI — the committed
// WebP files are the artifact, and a build step that silently re-derives
// binaries is how artwork drifts from its baselines.
//
// WHAT IT DELIBERATELY DOES NOT CARRY OVER. The deck script repairs a
// transparent band the upstream SVGs left in their own face fill. That was
// an authoring bug in THAT upstream, and repairing it here would be a
// distortion: these files are transparent ON PURPOSE. Each one draws the
// tile's own dark rounded OUTLINE out to the edge of the canvas -- measured,
// the alpha bounding box is the full canvas on all 42 -- plus the symbol,
// and leaves the INTERIOR see-through. The bone behind it and the bevel come
// from `../src/tile-body.ts`, which registers with this exact box.
//
// WHY 195x279, AND WHY IT IS NOT 80. The deck's rule is "raster at ~2.7x the
// largest width the thing is ever DRAWN at" (process-svg-deck.mjs:25-29,
// which derived 329 from a 122px card). Applying it needs the LARGEST
// on-screen width. 29.5px is this board's SMALLEST-container (binding)
// width, and 2.7x of it is where the 80px figure in the render measurement
// came from -- the rule read backwards. The largest is bounded instead by a
// declared cap, `TILE_MAX_INLINE_SIZE` (72px, ../src/geometry.ts), and
// because the artwork IS the tile rather than something inset inside one,
// the tile's width is the artwork's width:
//
//     WIDTH  = ceil(TILE_MAX_INLINE_SIZE * 2.7) = ceil(194.4) = 195
//     HEIGHT = round(WIDTH / TILE_ART_RATIO)    = round(279.0) = 279
//
// where TILE_ART_RATIO is 0.69882, the intrinsic ratio of the source:
// `viewBox="0 0 139.764 200"` on all 42 files, zero variation.
// `front-image.test.ts` re-derives both numbers from those constants AND
// reads them back out of the shipped bytes, so a cap change nobody
// re-rasterized fails loudly instead of leaving a stale rationale behind --
// which is exactly what ../../spanish-deck-ui/src/front-image.ts:128-141
// records happening once.
//
// LOSSLESS, AND IT IS MEASURED. Flat vector art compresses better without
// loss than with it: 3.0KB vs 4.2KB on the one of characters, 2.0KB vs 3.0KB
// on the red dragon, and the same direction on every file tried. Lossless is
// smaller AND exact, so there is no trade to make. Alpha survives either way
// (VP8L carries it), and alpha is the whole point here.
//
// THE UPSTREAM CORRESPONDENCE LIVES IN ONE PLACE AND IT IS NOT HERE.
// `TILE_ART_SOURCES` (../src/about.ts) maps each face to the Commons file it
// came from, because that map is a LICENSING fact before it is a build input
// — CC BY-SA 4.0 asks for a URI to the material, per file. So this tool reads
// it from the built package (`../dist/about.js`, the same way
// spanish-deck-ui's own `scripts/generate-sample.mjs` reads `../dist/`)
// rather than keeping a second copy that could drift from the credit.
//
// Requires on PATH: rsvg-convert, ImageMagick's `magick`; `fetch` needs only
// Node's own global fetch. Requires `pnpm exec tsc -b` to have run, for the
// map above.
//
// Usage:
//   node tools/process-svg-tiles.mjs fetch <dir>
//       Downloads the 42 source SVGs from Commons into <dir>, one every two
//       seconds with a descriptive User-Agent. The spacing is not politeness
//       theatre: a fast series of the same 42 requests was answered with
//       HTTP 429 after seven files.
//
//   node tools/process-svg-tiles.mjs build <dir>
//       Rasterizes the 42 faces out of <dir> and writes
//       assets/tiles/<tileId>.webp.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { TILE_ART_SOURCES } from "../dist/about.js";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const TILES_DIR = path.join(PACKAGE_ROOT, "assets", "tiles");

const API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "convite-tile-art/1.0 (https://github.com/dgmlnr/Convite; asset build) node-fetch";

/** Derived in ../src/geometry.ts and asserted there against these files. */
const WIDTH = 195;
const HEIGHT = 279;

async function fetchUpstream(dir) {
  if (existsSync(dir)) throw new Error(`refusing to download over an existing path: ${dir}`);
  mkdirSync(dir, { recursive: true });
  for (const file of Object.values(TILE_ART_SOURCES)) {
    // The real URL is asked for rather than guessed: Commons stores files
    // under an md5-derived hash path, and constructing one by hand is a
    // silent 404 waiting to happen.
    const query = `${API}?action=query&format=json&prop=imageinfo&iiprop=url&titles=${encodeURIComponent(`File:${file}`)}`;
    const meta = await (await fetch(query, { headers: { "user-agent": USER_AGENT } })).json();
    const pages = Object.values(meta.query.pages);
    const url = pages[0]?.imageinfo?.[0]?.url;
    if (url === undefined) throw new Error(`Commons has no imageinfo for ${file}`);
    const svg = await (await fetch(url, { headers: { "user-agent": USER_AGENT } })).arrayBuffer();
    writeFileSync(path.join(dir, file), Buffer.from(svg));
    console.log(`fetched ${file}`);
    await sleep(2_000);
  }
}

function build(dir) {
  mkdirSync(TILES_DIR, { recursive: true });
  let written = 0;
  for (const [tileId, file] of Object.entries(TILE_ART_SOURCES)) {
    const source = path.join(dir, file);
    if (!existsSync(source)) throw new Error(`missing source face: ${source}`);
    // Two processes rather than one: rsvg renders the vector honestly and
    // keeps the source's own alpha, magick only encodes. Piping PNG between
    // them avoids a temp file and avoids asking either tool to do the
    // other's job badly.
    const png = execFileSync("rsvg-convert", ["-w", String(WIDTH), "-h", String(HEIGHT), "-f", "png", source], { maxBuffer: 64 * 1024 * 1024 });
    execFileSync("magick", ["png:-", "-define", "webp:lossless=true", `webp:${path.join(TILES_DIR, `${tileId}.webp`)}`], { input: png });
    written += 1;
  }
  console.log(`wrote ${String(written)} faces to ${TILES_DIR}`);
}

const [command, target] = process.argv.slice(2);
if (command === "fetch" && target !== undefined) await fetchUpstream(target);
else if (command === "build" && target !== undefined) build(target);
else {
  console.error("usage: process-svg-tiles.mjs fetch <dir> | build <dir>");
  process.exit(1);
}
