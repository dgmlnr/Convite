import { describe, expect, it } from "vitest";
import { ALL_TILES, tileId as engineTileId } from "@hexdev/mahjong-solitaire-engine";
import { ALL_TILE_FACES, TILE_FRONT_FILENAMES, tileId as artTileId } from "@hexdev/mahjong-tile-ui";

/**
 * THE ENGINE AND THE ARTWORK AGREE ON WHAT A FACE IS CALLED — and this is the
 * first tier that is allowed to check.
 *
 * `mahjong-solitaire-engine` declares its own tile identity and may import no
 * workspace package at all (`l0-game-engine-no-workspace-deps`).
 * `mahjong-tile-ui` re-declares the same identity and may import none either
 * (`l0-mahjong-tile-ui-no-workspace-deps`). Two files, two suites, one naming
 * convention, and a rule in each of them forbidding the import that would
 * close the gap — slice 6 recorded it as an open risk with no possible fence
 * and handed it forward.
 *
 * THIS PACKAGE IS WHERE IT STOPS BEING OPEN. `board.ts` has to map a face NAME
 * off the board to the artwork that draws it, so it imports both, and an L1
 * game UI importing its own engine and its own art is exactly what the layer
 * rules already permit. The check costs three lines and it is the only place
 * in the repository where the two vocabularies are in scope at once.
 *
 * WHAT A DRIFT WOULD HAVE LOOKED LIKE WITHOUT IT: `getTileArt` returning
 * nothing for a name the board really holds, so the tile draws as a blank
 * bone — or, if the name reached a URL, a 404 on the asset route. Loud at
 * runtime, invisible in CI, which is this repository's own name for the
 * defect class.
 */
describe("the engine's face names and the artwork's are the same 42 strings", () => {
  it("the wall collapses onto exactly the faces the art package draws", () => {
    const fromEngine = [...new Set(ALL_TILES.map((tile) => engineTileId(tile)))].sort();
    const fromArt = ALL_TILE_FACES.map((tile) => artTileId(tile)).sort();

    // R6, and sized against the collections rather than against a literal a
    // neighbouring fence also asserts (R14): two empty lists are equal.
    expect(fromEngine.length).toBeGreaterThan(0);
    expect(ALL_TILES.length).toBeGreaterThan(fromEngine.length);
    expect(fromEngine).toEqual(fromArt);
  });

  it("and every one of them has a file the asset route will serve", () => {
    // The third vocabulary: the filenames `widget-frontdoor` accepts. A name
    // the engine can produce that the route refuses is a 404 in a live match.
    const missing = [...new Set(ALL_TILES.map((tile) => engineTileId(tile)))].filter((id) => !TILE_FRONT_FILENAMES.has(`${id}.webp`));
    expect(TILE_FRONT_FILENAMES.size).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
