import { describe, expect, it } from "vitest";
import * as diceUi from "./index.js";

/**
 * THIS PACKAGE HAS TO WORK WITH NO DOM AT ALL — the identical constraint
 * `mahjong-tile-ui/node-import.test.ts` proves for itself, for the identical
 * reason: a future Node-only consumer (a server route needing a die's
 * geometry or attribution-free status, the same shape `widget-frontdoor`
 * already takes on `mahjong-tile-ui` for `TILE_FRONT_FILENAMES`) must not
 * crash at import time because something at module scope reached for
 * `document`. `createDiceCup`/`createDieSceneElement` both take `Document`
 * as an explicit PARAMETER rather than reading a global — this test proves
 * that by exercising every DOM-free export, not merely importing the
 * barrel.
 */
describe("the package is usable from Node, with no DOM anywhere", () => {
  it("really is running without a document, so the cases below cannot pass vacuously", () => {
    expect((globalThis as { document?: unknown }).document).toBeUndefined();
  });

  it("imports without touching one", () => {
    expect(Object.keys(diceUi).length).toBeGreaterThan(0);
  });

  it("resolves a die face's artwork URL without one — pure string/URL arithmetic, no fetch", () => {
    expect(diceUi.getDieFaceArtUrl(3)).toBeInstanceOf(URL);
    expect(typeof diceUi.getDieFaceArt(3).src).toBe("string");
  });

  it("resolves the cup's artwork URL without one", () => {
    expect(diceUi.getCupArtUrl()).toBeInstanceOf(URL);
  });

  it("writes a resting-pose declaration for every face without one", () => {
    for (const face of diceUi.DIE_FACES) {
      expect(diceUi.restingPoseDeclaration(face)).toContain("--dice-rest-x");
    }
  });

  it("builds the stylesheet text without one", () => {
    expect(typeof diceUi.buildDiceStylesheet()).toBe("string");
  });
});
