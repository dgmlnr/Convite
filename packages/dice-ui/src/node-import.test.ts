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

  it("draws a die's body, pips and full face without one — all three are strings, never elements", () => {
    expect(typeof diceUi.dieBodySvg()).toBe("string");
    expect(typeof diceUi.diePipsSvg(3)).toBe("string");
    expect(typeof diceUi.dieFaceSvg(3)).toBe("string");
  });

  it("draws the cup's body without one", () => {
    expect(typeof diceUi.cupBodySvg()).toBe("string");
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
