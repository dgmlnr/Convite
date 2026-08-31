import { describe, expect, it } from "vitest";
import * as tileUi from "./index.js";

/**
 * THIS PACKAGE HAS TO WORK WITH NO DOM AT ALL, and that is a constraint, not
 * an observation.
 *
 * `widget-frontdoor` is a Node package — it answers HTTP requests and never
 * opens a browser — and it now imports this one, for `TILE_FRONT_FILENAMES`,
 * so the route can accept a filename by membership instead of by a regex it
 * cannot check. If anything reachable from the barrel touched `document`,
 * that import would crash the server at boot, and the failure would look like
 * a deployment problem rather than like a layering mistake.
 *
 * The design named this as "a constraint to test, not a fact". This is that
 * test, and it EXERCISES rather than merely imports: a bare import only
 * proves module scope is clean, and everything risky here lives inside a
 * function body.
 */
describe("the package is usable from Node, with no DOM anywhere", () => {
  it("really is running without a document, so the cases below cannot pass vacuously", () => {
    expect((globalThis as { document?: unknown }).document).toBeUndefined();
  });

  it("imports without touching one", () => {
    expect(Object.keys(tileUi).length).toBeGreaterThan(0);
  });

  it("resolves art, labels and geometry for all 42 faces without one", () => {
    for (const tile of tileUi.ALL_TILE_FACES) {
      expect(tileUi.tileId(tile).length).toBeGreaterThan(0);
      expect(tileUi.getTileFrontUrl(tile).protocol).toBe("file:");
      expect(tileUi.getTileArt(tile).width).toBe(tileUi.TILE_FRONT_WIDTH);
      expect(tileUi.tileLabel(tile).length).toBeGreaterThan(0);
    }
  });

  it("draws the tile body without one — it is a string, never an element", () => {
    expect(typeof tileUi.tileBodySvg()).toBe("string");
  });

  it("answers the route's membership question without one", () => {
    expect(tileUi.TILE_FRONT_FILENAMES.has("5-circles.webp")).toBe(true);
    expect(tileUi.TILE_FRONT_FILENAMES.has("5-diamonds.webp")).toBe(false);
  });

  it("builds a credit URI without one", () => {
    expect(tileUi.commonsFilePage(tileUi.TILE_ART_SOURCES["dragon-red"])).toContain("commons.wikimedia.org");
  });
});
