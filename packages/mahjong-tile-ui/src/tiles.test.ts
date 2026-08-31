import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_TILE_FACES, TILE_FRONT_FILENAMES } from "./tiles.js";
import { tileId } from "./tile.js";

/** The real checked-in directory, resolved the same way `front-image.ts`
 * resolves an individual file: `../assets/tiles/` sits one level above both
 * `src/` and the compiled `dist/`. */
const TILES_DIR = fileURLToPath(new URL("../assets/tiles/", import.meta.url));

describe("tiles: the 42 faces are the artwork, not the wall", () => {
  /**
   * 42, not 144. The engine's `ALL_TILES` is the WALL — four copies of each
   * of the 34 ordinary faces plus one of each of the 8 bonus tiles. This
   * package draws faces, and four copies of the five of circles are one
   * drawing, so the count that belongs here is the number of distinct FACES.
   */
  it("holds exactly 42 faces", () => {
    expect(ALL_TILE_FACES).toHaveLength(42);
  });

  it("gives every face a distinct id — no two faces share a drawing", () => {
    const ids = new Set(ALL_TILE_FACES.map((tile) => tileId(tile)));
    expect(ids.size).toBe(ALL_TILE_FACES.length);
  });

  it("covers all five kinds, so no group was dropped wholesale", () => {
    const kinds = ALL_TILE_FACES.map((tile) => tile.kind);
    expect(kinds.filter((kind) => kind === "suit")).toHaveLength(27);
    expect(kinds.filter((kind) => kind === "wind")).toHaveLength(4);
    expect(kinds.filter((kind) => kind === "dragon")).toHaveLength(3);
    expect(kinds.filter((kind) => kind === "flower")).toHaveLength(4);
    expect(kinds.filter((kind) => kind === "season")).toHaveLength(4);
  });
});

/**
 * A DERIVED SET, AND THE REASON IS NOT STYLE.
 *
 * `widget-frontdoor`'s card route matches a hand-typed regex whose comment
 * claims it is `cardId()`'s shape (`static-deck-assets.ts:13`); it is not
 * checked against `cardId` by anything, because that package does not depend
 * on `spanish-deck-ui` at all. A regex can only ever be tested for
 * COMPLETENESS — you can prove it accepts the 42 valid names, one by one —
 * and never for SOUNDNESS, because enumerating a regular language to show it
 * accepts nothing else is not something a test can do. A Set built from
 * `tileId()` is sound AND complete by construction: it contains those 42
 * strings and, by the definition of a Set, nothing else.
 */
describe("tiles: TILE_FRONT_FILENAMES is derived from tileId, never typed", () => {
  it("holds one filename per face and nothing else", () => {
    expect(TILE_FRONT_FILENAMES.size).toBe(ALL_TILE_FACES.length);
    for (const tile of ALL_TILE_FACES) {
      expect(TILE_FRONT_FILENAMES.has(`${tileId(tile)}.webp`), `missing ${tileId(tile)}`).toBe(true);
    }
  });

  it("rejects a name with the right extension and a wrong stem — the case a bare /\\.webp$/ would accept", () => {
    expect(TILE_FRONT_FILENAMES.has("10-circles.webp")).toBe(false);
    expect(TILE_FRONT_FILENAMES.has("dragon-blue.webp")).toBe(false);
    expect(TILE_FRONT_FILENAMES.has("wind-northeast.webp")).toBe(false);
    expect(TILE_FRONT_FILENAMES.has("../secret.webp")).toBe(false);
  });

  it("rejects a real face under any other extension", () => {
    expect(TILE_FRONT_FILENAMES.has("5-circles.svg")).toBe(false);
    expect(TILE_FRONT_FILENAMES.has("5-circles")).toBe(false);
  });
});

/**
 * THE LICENCE AUDIT, AND IT RUNS BOTH WAYS.
 *
 * `assets/LICENSE` credits 碧海风 under CC BY-SA 4.0 for "these 42 files".
 * That sentence is only true while the directory holds exactly the 42 this
 * package names: a 43rd file dropped in there would be distributed under a
 * credit that never covered it, and a missing one would be a face that
 * resolves to a 404 nobody notices until a board is on screen.
 *
 * So the manifest is not a hand-written list beside the files — it IS
 * `TILE_FRONT_FILENAMES`, and this compares it to the real directory in both
 * directions. A hand-written list would reproduce the enumerating-config
 * defect this repo already has a name for.
 */
describe("tiles: every shipped file is credited, and every credited file ships", () => {
  it("matches the checked-in assets/tiles/ directory exactly, both ways", () => {
    const onDisk = readdirSync(TILES_DIR);
    // Anti-vacuity, sized against the collection it guards and never against
    // the neighbouring count fence's literal: an empty read would otherwise
    // make "no uncredited file" pass for the wrong reason.
    expect(onDisk.length).toBe(TILE_FRONT_FILENAMES.size);
    expect(onDisk.filter((file) => !TILE_FRONT_FILENAMES.has(file)), "shipped but not credited").toEqual([]);
    expect([...TILE_FRONT_FILENAMES].filter((file) => !onDisk.includes(file)), "credited but not shipped").toEqual([]);
  });
});
