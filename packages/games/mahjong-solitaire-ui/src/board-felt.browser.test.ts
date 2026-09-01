import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { ALL_TILES, layBoard, tileId } from "@hexdev/mahjong-solitaire-engine";
import type { PlayerId } from "@hexdev/mahjong-solitaire-engine";
import { BOARD_PADDING } from "./board-geometry.js";
import { BOARD_STYLE_ID } from "./board-styles.js";
import { createMahjongBoardRenderer } from "./board.js";

/**
 * THE FELT IS THE WHOLE BOX, AND THE TURTLE SITS IN THE MIDDLE OF IT.
 *
 * `board-fit.browser.test.ts` next door asks whether the turtle FITS, which
 * is a question about the tiles. This asks what the player sees around them,
 * which is a different question with a different wrong answer: a board can
 * fit perfectly and still be drawn against a strip of the host's own
 * background, because the surface is exactly as tall as its contents and the
 * felt is the surface's own background.
 *
 * IT IS ONE DEFECT AND NOT TWO. Reported as "the felt does not fill the
 * container" and "the tiles could be better centred", and both are the same
 * missing height: `place-items: center` has nothing to centre against in a
 * box whose height IS its content, so the turtle lands at the top and the
 * remainder is not felt at all. Fixing the height fixes the position, which
 * is why both assertions live in one file.
 *
 * FULLSCREEN ONLY, on exactly the terms the sheet's own cap already stands
 * on: inline, the host sizes the iframe to the height the widget reports, so
 * a board stretched to `100dvh` there would report a height that is a
 * function of the window rather than of the turtle. The last test is what
 * keeps that scoping honest rather than claimed.
 */

const LAYOUT_ATTRIBUTE = "data-hexdev-layout";
const PLAYER = "board-felt-player" as unknown as PlayerId;

let container: HTMLElement;

afterEach(async () => {
  container.remove();
  document.documentElement.removeAttribute(LAYOUT_ATTRIBUTE);
  document.getElementById(BOARD_STYLE_ID)?.remove();
  await page.viewport(414, 896);
});

/**
 * THE HOST'S BOX WITH THE BOARD AS A CHILD OF IT, which is the arrangement
 * `createMahjongRenderer` builds and the only one where this defect exists.
 *
 * The renderer puts `hexdev-mahjong-board` on the element it is HANDED, so a
 * fence that rendered straight into the pinned `inset: 0` box would be
 * measuring that box's own height and would pass against the broken sheet.
 * The app hands it a child, because the completion panel is its sibling and
 * needs a positioned ancestor to hang off — so the felt is an ordinary
 * in-flow element whose height comes from its contents unless something says
 * otherwise. That is exactly the element under test.
 */
async function mountedFullscreen(w: number, h: number): Promise<HTMLElement> {
  await page.viewport(w, h);
  document.documentElement.setAttribute(LAYOUT_ATTRIBUTE, "fullscreen");
  container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
  document.body.appendChild(container);
  const boardEl = document.createElement("div");
  container.appendChild(boardEl);
  return boardEl;
}

function renderTurtle(el: HTMLElement): void {
  createMahjongBoardRenderer()(el, layBoard(PLAYER, ALL_TILES.map((tile) => tileId(tile))).tiles);
}

function feltOf(el: HTMLElement): HTMLElement {
  if (!el.classList.contains("hexdev-mahjong-board")) throw new Error("fence setup: no board was drawn");
  return el;
}

function surfaceOf(el: HTMLElement): HTMLElement {
  const surface = el.querySelector<HTMLElement>(".hexdev-mahjong-board-surface");
  if (surface === null) throw new Error("fence setup: no board was drawn");
  return surface;
}

/**
 * A WINDOW THE WIDTH BINDS, which is the only shape where this defect is
 * visible at all. When the height binds, the turtle already grows until it
 * fills the box and there is no remainder to get wrong — so a fence written
 * at a short landscape window would pass against the broken sheet. This one
 * is tall and narrow-ish on purpose: 15 tile-columns of width buy a board
 * about 139px shorter than the window, which is the gap that was showing.
 */
const WIDTH_BOUND = { w: 944, h: 873 } as const;

describe("the felt fills the box the host pinned it to", () => {
  it("is as tall as the window, not as tall as the turtle", async () => {
    const el = await mountedFullscreen(WIDTH_BOUND.w, WIDTH_BOUND.h);
    renderTurtle(el);

    const felt = feltOf(el).getBoundingClientRect();
    const surface = surfaceOf(el).getBoundingClientRect();

    expect(felt.height).toBeCloseTo(WIDTH_BOUND.h, 0);
    // R6: without this the assertion above is satisfied by a window the
    // turtle happens to fill exactly, and the fence would be measuring
    // nothing. The turtle must be genuinely shorter than the felt here.
    expect(surface.height).toBeLessThan(felt.height - 50);
  });

  it("centres the turtle in the space that leaves, top and bottom alike", async () => {
    const el = await mountedFullscreen(WIDTH_BOUND.w, WIDTH_BOUND.h);
    renderTurtle(el);

    const felt = feltOf(el).getBoundingClientRect();
    const surface = surfaceOf(el).getBoundingClientRect();

    const above = surface.top - felt.top;
    const below = felt.bottom - surface.bottom;
    expect(above).toBeCloseTo(below, 0);
    // R6, AND IT IS NOT PEDANTRY HERE. Against the broken sheet the felt is
    // the turtle plus its padding, so `above` and `below` are both exactly
    // that padding and they ARE equal — the symmetry assertion above passes
    // on the defect. What distinguishes the two is that there be real empty
    // felt to be centred in, so the margin has to be worth more than the
    // padding that would exist either way.
    expect(above).toBeGreaterThan(BOARD_PADDING * 4);
  });
});

describe("and inline it still reports its own height", () => {
  it("stays as tall as the turtle, because the host sizes the iframe to what it is told", async () => {
    // THE DISCRIMINATOR. A sheet that stretched the felt in every mode would
    // make an embedded widget claim the whole window, and the host would grant
    // it — an iframe as tall as the visitor's screen on a page that asked for
    // a game. `board-fit`'s own last test makes the same argument about the
    // tile cap; this one makes it about the box.
    await page.viewport(WIDTH_BOUND.w, WIDTH_BOUND.h);
    container = document.createElement("div");
    container.style.width = `${String(WIDTH_BOUND.w)}px`;
    document.body.appendChild(container);
    const boardEl = document.createElement("div");
    container.appendChild(boardEl);
    renderTurtle(boardEl);

    const felt = feltOf(boardEl).getBoundingClientRect();
    const surface = surfaceOf(boardEl).getBoundingClientRect();
    expect(felt.height).toBeLessThan(WIDTH_BOUND.h);
    expect(felt.height).toBeCloseTo(surface.height + 2 * BOARD_PADDING, 0);
  });
});

describe("a tile is a game piece, not a paragraph", () => {
  it("cannot be selected by dragging across the board", async () => {
    // Reported from real play: dragging over the turtle painted the top row
    // in the browser's selection colour, because a tile is an element with an
    // image in it and nothing said otherwise. There is no text on this board
    // to select, so the gesture can only ever produce the artefact.
    const el = await mountedFullscreen(WIDTH_BOUND.w, WIDTH_BOUND.h);
    renderTurtle(el);

    const felt = feltOf(el);
    const tile = felt.querySelector<HTMLElement>("[data-position]")!;
    expect(getComputedStyle(felt).userSelect).toBe("none");
    // Inherited rather than restated on the tile, but ASSERTED on the tile,
    // because inheritance is the mechanism and the tile is where the gesture
    // actually lands.
    expect(getComputedStyle(tile).userSelect).toBe("none");
  });

  it("and cannot be dragged out of the board as an image", async () => {
    // A separate refusal from the one above and not a duplicate of it:
    // `user-select` governs the selection, `draggable` governs the native
    // image drag, and an `<img>` is draggable by default. Suppressing only
    // the first leaves a tile that peels off under the cursor with a ghost
    // preview — the same gesture, a different artefact.
    const el = await mountedFullscreen(WIDTH_BOUND.w, WIDTH_BOUND.h);
    renderTurtle(el);

    const faces = feltOf(el).querySelectorAll<HTMLImageElement>(".hexdev-mahjong-tile-face");
    expect(faces.length).toBeGreaterThan(0);
    for (const face of faces) expect(face.draggable).toBe(false);
  });
});
