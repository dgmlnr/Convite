import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { ALL_TILES, LAYOUT, layBoard, tileId } from "@hexdev/mahjong-solitaire-engine";
import type { PlayerId } from "@hexdev/mahjong-solitaire-engine";
import { TILE_FRONT_HEIGHT, TILE_FRONT_WIDTH } from "@hexdev/mahjong-tile-ui";
import { BOARD_PADDING, bindingTileWidth, boardExtent, emptyInlineFraction } from "./board-geometry.js";
import { BOARD_STYLE_ID } from "./board-styles.js";
import { createMahjongBoardRenderer } from "./board.js";

/**
 * THE BOARD FITS THE WINDOW IT WAS GIVEN, AND THE FELT IT LEAVES EMPTY IS A
 * NUMBER SOMEBODY ACCEPTED.
 *
 * Measured, never photographed — the same argument `escoba-viewport-fit` makes
 * one game over: Chromium never paints past the viewport, so a screenshot
 * taken at the fold is the same image whether the layout fits or overflows by
 * two hundred pixels. `getBoundingClientRect()` is unbothered by the fold.
 *
 * ONLY IN FULLSCREEN, and the last test here is what proves that scoping is
 * real rather than claimed. `enterMatch` sends `sendLayout("fullscreen")`
 * before a single tile is drawn, so every live match is covered; INLINE the
 * host sizes the iframe to the height the widget reports, which would make
 * `100dvh` a function of this board's own content.
 */

/** The attribute `apps/widget-app/src/handshake.ts` stamps on its own document
 * root whenever it tells the host to switch modes. A literal on purpose: if
 * that contract is renamed, this fence must fail rather than quietly stop
 * covering anything. */
const LAYOUT_ATTRIBUTE = "data-hexdev-layout";

const PLAYER = "board-fit-player" as unknown as PlayerId;

let container: HTMLElement;

afterEach(async () => {
  container.remove();
  document.documentElement.removeAttribute(LAYOUT_ATTRIBUTE);
  document.getElementById(BOARD_STYLE_ID)?.remove();
  await page.viewport(414, 896); // visual/README.md's own default
});

/** The fullscreen box, reproduced: `applyLayoutMode` pins the widget to the
 * viewport with `position: fixed; inset: 0`, and the attribute goes on BEFORE
 * the first render so the cap is in effect for the initial layout rather than
 * applied to an already-measured one. */
async function mountedFullscreen(w: number, h: number): Promise<HTMLElement> {
  await page.viewport(w, h);
  document.documentElement.setAttribute(LAYOUT_ATTRIBUTE, "fullscreen");
  container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
  document.body.appendChild(container);
  return container;
}

function renderTurtle(el: HTMLElement): void {
  createMahjongBoardRenderer()(el, layBoard(PLAYER, ALL_TILES.map((tile) => tileId(tile))).tiles);
}

/** The board's own box — never the container's, which is `inset: 0` and
 * therefore measures the viewport no matter how far its contents spill. */
function surfaceOf(el: HTMLElement): HTMLElement {
  const surface = el.querySelector<HTMLElement>(".hexdev-mahjong-board-surface");
  if (surface === null) throw new Error("fence setup: no board was drawn");
  return surface;
}

/** Real rotated phones, all of them SHORT and WIDE — the shape that binds this
 * board's height, and the same three windows escoba's own fit fence uses. */
const WINDOWS = [
  { w: 844, h: 390, label: "iPhone 14, landscape" },
  { w: 926, h: 428, label: "iPhone 14 Plus, landscape" },
  { w: 740, h: 360, label: "small Android, landscape" },
] as const;

describe.each(WINDOWS)("the turtle fits its own window — $w x $h ($label)", ({ w, h }) => {
  it("draws every position and nothing renders past the fold", async () => {
    const el = await mountedFullscreen(w, h);
    renderTurtle(el);

    const surface = surfaceOf(el);
    // R6: a board that drew nothing fits every window there is.
    expect(surface.querySelectorAll("[data-position]")).toHaveLength(LAYOUT.length);

    const box = surface.getBoundingClientRect();
    expect(box.width, `the board is wider than ${String(w)}px of window`).toBeLessThanOrEqual(w);
    expect(box.height, `the board is taller than ${String(h)}px of window`).toBeLessThanOrEqual(h);
    expect(el.scrollHeight, "something renders below the fold of a box the host cannot scroll").toBeLessThanOrEqual(h);
  });

  it("draws its tiles at exactly the width the model says the room affords", async () => {
    // TASK 7.10's automatable half. The verdict a person gives about legibility
    // is only worth something if the width it was given at cannot drift out
    // from under it, so the number is pinned to the model rather than to a
    // literal — and `board-geometry.test.ts` pins the model to literals.
    const el = await mountedFullscreen(w, h);
    renderTurtle(el);

    const room = { inlineSize: w - 2 * BOARD_PADDING, blockSize: h - 2 * BOARD_PADDING };
    const tile = surfaceOf(el).querySelector<HTMLElement>("[data-position]")!;
    expect(tile.getBoundingClientRect().width).toBeCloseTo(bindingTileWidth(room), 1);
    expect(surfaceOf(el).getBoundingClientRect().width).toBeCloseTo(boardExtent(bindingTileWidth(room)).inlineSize, 1);
  });
});

describe("the empty felt, at the window this game is hardest to fit into", () => {
  it("a rotated phone binds the tile at 30.8px and leaves 41.6% of the width empty", async () => {
    /**
     * PINNED, AND IT IS NOT THE 36.6% THIS CHANGE CARRIED FOR SIX SLICES.
     * That figure was computed at r = 0.75 from an asset survey describing the
     * artwork as a bare face symbol; the drawing IS the tile, at its own
     * 0.69882, and a narrower tile against the same height budget is a
     * narrower board. Design D1 accepted this margin on the condition that it
     * be a number somebody looked at — this is where it stops being able to
     * move in silence.
     */
    const el = await mountedFullscreen(844, 390);
    renderTurtle(el);

    const room = { inlineSize: 844 - 2 * BOARD_PADDING, blockSize: 390 - 2 * BOARD_PADDING };
    const box = surfaceOf(el).getBoundingClientRect();

    expect(box.width).toBeCloseTo(483.48, 0);
    expect(box.height).toBeCloseTo(374, 0);
    expect(1 - box.width / room.inlineSize).toBeCloseTo(0.41609, 2);
    expect(emptyInlineFraction(room)).toBeCloseTo(1 - box.width / room.inlineSize, 2);
  });

  it("and the height is what binds it — inline, with no ceiling, the same window draws a bigger tile", async () => {
    // THE DISCRIMINATOR for the fullscreen scoping. Without it, "the board
    // fits" is compatible with a sheet that caps the tile in every mode, which
    // would shrink an inline widget for a ceiling it does not have.
    await page.viewport(844, 390);
    container = document.createElement("div");
    container.style.width = "844px";
    document.body.appendChild(container);
    renderTurtle(container);

    const tile = surfaceOf(container).querySelector<HTMLElement>("[data-position]")!;
    const inlineWidth = tile.getBoundingClientRect().width;
    expect(inlineWidth).toBeCloseTo(bindingTileWidth({ inlineSize: 844 - 2 * BOARD_PADDING, blockSize: Number.MAX_SAFE_INTEGER }), 1);
    expect(inlineWidth).toBeGreaterThan(bindingTileWidth({ inlineSize: 844 - 2 * BOARD_PADDING, blockSize: 390 - 2 * BOARD_PADDING }));
  });
});

describe("the faces are real bytes, fetched through a real dev server", () => {
  /**
   * THE ONLY PLACE THE VITE TRAP CAN EVER BE FENCED, and until this file
   * existed there was nowhere.
   *
   * `mahjong-tile-ui/src/front-image.ts` resolves art with ONE
   * `new URL(/* @vite-ignore *\/ template, import.meta.url)` call, copied
   * verbatim from the deck because that file records two Vite failures in
   * opposite directions — a two-step base-URL form that works under Node and
   * under `vite build` and silently 404s every file under the DEV SERVER, and
   * a template literal without the ignore comment that fixes the dev server
   * and makes Rollup bundle all 42 under hashed names.
   *
   * Slice 6 measured that the two-step form passes the ENTIRE unit suite:
   * under Node both forms resolve identically, and asserting on the `src`
   * STRING stays true either way. Only fetching the bytes can tell them apart,
   * and nothing rendered a tile until this slice. Vitest Browser Mode serves
   * every module through a real Vite dev server, so this is that fetch.
   *
   * `decode()` REJECTS on a 404, which is what makes this a fence rather than
   * a decoration; `naturalWidth` is the second half, because a decoded
   * placeholder is not the artwork.
   */
  it("every tile's face loads, and it is the 195x279 raster this package ships", async () => {
    const el = await mountedFullscreen(844, 390);
    renderTurtle(el);

    const images = [...el.querySelectorAll("img")];
    expect(images, "R6: no images is not the same as no broken images").toHaveLength(LAYOUT.length);
    await Promise.all(images.map((image) => image.decode()));

    for (const image of images) {
      expect(image.naturalWidth, `${image.src} decoded to nothing`).toBe(TILE_FRONT_WIDTH);
      expect(image.naturalHeight).toBe(TILE_FRONT_HEIGHT);
    }
  });
});
