import { describe, expect, it } from "vitest";
import { DIE_FACES, DIE_VIEWBOX, FACE_PIP_SLOTS, PIP_SLOTS } from "./geometry.js";
import { diePipsSvg } from "./die-pips.js";

/**
 * A face's pips are read off `FACE_PIP_SLOTS`, so this suite checks the
 * generator against the SAME table `geometry.test.ts` already checks for
 * shape — the guarantee that matters here is that `diePipsSvg` actually
 * draws what the table says, not a second, independent description of what
 * a die looks like.
 */
describe("die-pips: every face draws exactly the circles its slot list names", () => {
  /**
   * A REAL REGRESSION, NAMED: a bare `<circle>` with no enclosing `<svg>`
   * root parses as an unrecognised HTML element when mounted via
   * `innerHTML` on a plain `<div>` (`die-face.ts`'s own mount path) and
   * renders as nothing — every pip on every face vanished, only the body
   * showed, caught by looking at `dice.scene.test.ts`'s rendered gallery
   * rather than by any assertion until this one existed.
   */
  it("wraps its circles in a real <svg> root sharing the die's own viewBox", () => {
    for (const face of DIE_FACES) {
      const markup = diePipsSvg(face);
      expect(markup).toMatch(/^<svg[^>]*>/);
      expect(markup).toContain(`viewBox="${DIE_VIEWBOX}"`);
      expect(markup.trim().endsWith("</svg>")).toBe(true);
    }
  });

  it("draws one <circle> per slot in FACE_PIP_SLOTS, for every face", () => {
    for (const face of DIE_FACES) {
      const markup = diePipsSvg(face);
      const circles = [...markup.matchAll(/<circle/g)];
      expect(circles.length).toBe(FACE_PIP_SLOTS[face].length);
    }
  });

  it("positions every pip at one of the nine canonical slots, never off-grid", () => {
    for (const face of DIE_FACES) {
      const markup = diePipsSvg(face);
      for (const slot of FACE_PIP_SLOTS[face]) {
        const [cx, cy] = PIP_SLOTS[slot]!;
        expect(markup).toContain(`cx="${String(cx)}" cy="${String(cy)}"`);
      }
    }
  });

  it("paints every pip from the one shared token, never a literal colour", () => {
    for (const face of DIE_FACES) {
      const markup = diePipsSvg(face);
      expect(markup).not.toMatch(/fill="#[0-9a-fA-F]/);
      expect(markup).toContain("var(--dice-pip)");
    }
  });

  it("draws a visibly different pip count between adjacent faces (1 and 2 do not collide)", () => {
    expect(diePipsSvg(1).match(/<circle/g)?.length).toBe(1);
    expect(diePipsSvg(2).match(/<circle/g)?.length).toBe(2);
  });
});
