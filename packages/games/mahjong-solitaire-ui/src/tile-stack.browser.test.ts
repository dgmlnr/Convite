import { afterEach, describe, expect, it } from "vitest";
import { LAYER_STEP_X, bindingTileWidth } from "./board-geometry.js";
import { BOARD_STYLE_ID, ensureBoardStyles } from "./board-styles.js";
import { tileIndexAtPoint } from "./hit-test.js";

/**
 * FIVE TILES ON TOP OF EACH OTHER, BUILT BY HAND — the synthetic fixture, and
 * it is not optional.
 *
 * The classic turtle really does stack five deep, but a fence written against
 * the real board can only ever ask "did the apex win on THIS layout". A tower
 * assembled here can be pointed at exactly the place the rules are supposed to
 * hold, and it stays pointed there when the layout data changes. Same lesson
 * the engine's own freedom rule learned: when the production data has no
 * counter-example, the hand-built fixture is the only thing that can fail.
 *
 * `board.browser.test.ts` is the other half — the real turtle, the real apex,
 * and the DOM order a renderer chose. Between them: this file proves the
 * stylesheet and the hit test agree about what "on top" means; that one proves
 * the board actually produces it.
 */

const CONTAINER_WIDTH = 900;

let board: HTMLElement;

afterEach(() => {
  board.remove();
  document.getElementById(BOARD_STYLE_ID)?.remove();
});

interface StackOptions {
  /** Ascending z is the order a board is drawn in. Reversed here is mutation
   * M7a's shape, kept as a parameter so the fence can prove the ordering is
   * what decides rather than asserting it about itself. */
  readonly descending?: boolean;
  /** Puts `pointer-events` back on the tile's face, which is what a caller
   * who never injected the sheet — or a face drawn by something with an
   * opinion of its own — would get. */
  readonly faceHitTestable?: boolean;
}

/** A tower of five tiles at one half-cell, one per layer, in the DOM order
 * the option asks for. `data-position` carries the layout index — here just
 * the layer, since a synthetic tower has no layout. */
function mountStack(options: StackOptions = {}): readonly HTMLElement[] {
  board = document.createElement("div");
  board.className = "hexdev-mahjong-board";
  board.style.width = `${String(CONTAINER_WIDTH)}px`;
  ensureBoardStyles(document);

  const surface = document.createElement("div");
  surface.className = "hexdev-mahjong-board-surface";

  const layers = [0, 1, 2, 3, 4];
  const tiles = (options.descending === true ? [...layers].reverse() : layers).map((z) => {
    const tile = document.createElement("div");
    tile.className = "hexdev-mahjong-tile";
    tile.dataset.position = String(z);
    tile.style.setProperty("--mj-x", "0");
    tile.style.setProperty("--mj-y", "0");
    tile.style.setProperty("--mj-z", String(z));
    // A child that would swallow the press if the sheet did not say
    // otherwise — the same shape the real tile has (its face and its body).
    const face = document.createElement("span");
    face.className = "hexdev-mahjong-tile-face";
    if (options.faceHitTestable === true) face.style.pointerEvents = "auto";
    tile.appendChild(face);
    surface.appendChild(tile);
    return tile;
  });

  board.appendChild(surface);
  document.body.appendChild(board);
  return tiles;
}

/** The tile drawn at layer `z`, whichever order it was appended in. */
function atLayer(tiles: readonly HTMLElement[], z: number): HTMLElement {
  const tile = tiles.find((candidate) => candidate.dataset.position === String(z));
  if (tile === undefined) throw new Error(`fence setup: no tile at layer ${String(z)}`);
  return tile;
}

/** The point every one of the five boxes contains — computed from the boxes
 * themselves rather than predicted, so it stays the right point when the
 * container width or the step changes. */
function commonPoint(tiles: readonly HTMLElement[]): { readonly x: number; readonly y: number } {
  const boxes = tiles.map((tile) => tile.getBoundingClientRect());
  const left = Math.max(...boxes.map((box) => box.left));
  const right = Math.min(...boxes.map((box) => box.right));
  const top = Math.max(...boxes.map((box) => box.top));
  const bottom = Math.min(...boxes.map((box) => box.bottom));
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

describe("the sheet stacks the layers up and to the right", () => {
  it("draws a tile at the width the room affords, and never wider than the cap", () => {
    const tiles = mountStack();
    // 884px of content box (900 minus this board's own padding on both
    // sides), which the geometry says buys a 56.35px tile — under the 72px
    // cap, so the inline budget is what decides here. The CSS and
    // `bindingTileWidth` are two expressions of one rule, and this is where
    // they are made to agree.
    const expected = bindingTileWidth({ inlineSize: 884, blockSize: Number.MAX_SAFE_INTEGER });
    expect(atLayer(tiles, 0).getBoundingClientRect().width).toBeCloseTo(expected, 1);
  });

  it("offsets each layer by the same number of pixels on both axes", () => {
    const tiles = mountStack();
    const base = atLayer(tiles, 0).getBoundingClientRect();
    const above = atLayer(tiles, 1).getBoundingClientRect();

    const stepRight = above.left - base.left;
    const stepUp = base.top - above.top;
    // ISOTROPIC IN PIXELS, ANISOTROPIC IN TILE FRACTIONS — 24 artwork units
    // is 17.17% of a tile's width and 12% of its height, and those two
    // fractions of their own axes are the SAME distance. A fence that only
    // watched one axis could not tell that apart from a sheet using one
    // fraction for both.
    // Tolerances of a twentieth of a pixel: Chromium lays out on a 1/64px
    // LayoutUnit grid and the two axes round independently, so the same CSS
    // length reaches `left` and `top` up to one of those apart. Far tighter
    // than any real defect here — dropping the step, halving it, or using one
    // axis's fraction for both moves these by whole pixels.
    expect(stepRight).toBeGreaterThan(0);
    expect(stepUp).toBeCloseTo(stepRight, 1);
    expect(stepRight).toBeCloseTo(base.width * LAYER_STEP_X, 1);
  });

  it("puts the apex four steps up and four steps right of the base layer", () => {
    const tiles = mountStack();
    const base = atLayer(tiles, 0).getBoundingClientRect();
    const apex = atLayer(tiles, 4).getBoundingClientRect();

    expect(apex.left - base.left).toBeCloseTo(4 * base.width * LAYER_STEP_X, 2);
    expect(base.top - apex.top).toBeCloseTo(4 * base.width * LAYER_STEP_X, 2);
  });
});

describe("a press inside the tower resolves to the tile on top", () => {
  it("all five boxes really do contain the probe point, so the question is not vacuous", () => {
    // R6. Five tiles that happen NOT to overlap would make every assertion
    // below pass against any hit test at all.
    const tiles = mountStack();
    const point = commonPoint(tiles);
    const containing = tiles.filter((tile) => {
      const box = tile.getBoundingClientRect();
      return box.left <= point.x && point.x <= box.right && box.top <= point.y && point.y <= box.bottom;
    });
    expect(containing).toHaveLength(tiles.length);
  });

  it("finds the apex through four layers of occlusion", () => {
    const tiles = mountStack();
    const point = commonPoint(tiles);
    expect(tileIndexAtPoint(document, point.x, point.y)).toBe(4);
  });

  it("with no z-index anywhere — DOM order alone is the paint order", () => {
    const tiles = mountStack();
    for (const tile of tiles) expect(getComputedStyle(tile).zIndex).toBe("auto");
    expect(getComputedStyle(board).zIndex).toBe("auto");
    expect(getComputedStyle(board.firstElementChild!).zIndex).toBe("auto");
  });

  it("and reversing the DOM order makes the base layer win instead", () => {
    // The discriminator. Without it, "the apex wins" is compatible with a hit
    // test that returns whatever it likes as long as the tower is built the
    // usual way.
    const tiles = mountStack({ descending: true });
    const point = commonPoint(tiles);
    expect(tileIndexAtPoint(document, point.x, point.y)).toBe(0);
  });

  it("still resolves when the tile's own children are hit-testable", () => {
    // WHY `closest` EARNS ITS LINE. The stylesheet takes the tile's face and
    // body out of the hit test, so `elementFromPoint` normally lands on the
    // tile itself. A caller that never injected the sheet — or a face drawn
    // by something that sets `pointer-events` back — lands on a child that
    // carries no `data-position`, and a hit test reading the returned element
    // directly would answer "nothing here" over a tile that is plainly there.
    const tiles = mountStack({ faceHitTestable: true });
    const point = commonPoint(tiles);
    const face = atLayer(tiles, 4).firstElementChild;
    expect(face, "fence setup: a tile must have a child to be swallowed by").not.toBeNull();

    expect(document.elementFromPoint(point.x, point.y)).toBe(face);
    expect(tileIndexAtPoint(document, point.x, point.y)).toBe(4);
  });

  it("answers null where there is no tile at all", () => {
    mountStack();
    expect(tileIndexAtPoint(document, 0, 0)).toBeNull();
  });
});
