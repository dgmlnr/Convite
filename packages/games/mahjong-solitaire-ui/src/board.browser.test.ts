import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { ALL_TILES, LAYOUT, layBoard, tileId } from "@hexdev/mahjong-solitaire-engine";
import type { PlayerId, TileId } from "@hexdev/mahjong-solitaire-engine";
import { TILE_ART_RATIO } from "@hexdev/mahjong-tile-ui";
import { BOARD_STYLE_ID } from "./board-styles.js";
import { createMahjongBoardRenderer } from "./board.js";
import type { BoardTiles } from "./board-identity.js";
import { tileIndexAtPoint } from "./hit-test.js";

/**
 * THE REAL TURTLE, DRAWN — the other half of `tile-stack.browser.test.ts`.
 * That file proves the sheet and the hit test agree about what "on top"
 * means, on a tower built to order; this one proves the renderer actually
 * produces that arrangement out of the layout the engine ships.
 */

const PLAYER = "board-fence-player" as unknown as PlayerId;

/** A dense 144-position board: the engine's own wall laid into the engine's
 * own layout, through the engine's own `layBoard`. Not a deal — this file is
 * about DOM, and a deal would only make it harder to say which tile is where. */
function fullBoard(): BoardTiles {
  return layBoard(PLAYER, ALL_TILES.map((tile) => tileId(tile))).tiles;
}

function without(board: BoardTiles, ...positions: readonly number[]): BoardTiles {
  const tiles: (TileId | null)[] = [...board];
  for (const position of positions) tiles[position] = null;
  return tiles;
}

/** The apex: the single position on the top layer. Found in the data rather
 * than written down, so a layout swap moves the fence with it. */
const APEX = LAYOUT.reduce((best, position, index) => (position.z > LAYOUT[best]!.z ? index : best), 0);

let container: HTMLElement;

afterEach(async () => {
  container.remove();
  document.getElementById(BOARD_STYLE_ID)?.remove();
  await page.viewport(414, 896); // visual/README.md's own default
});

/**
 * A WINDOW THE WHOLE BOARD FITS INSIDE, and it is not decoration.
 * `elementFromPoint` answers `null` for a coordinate outside the viewport, so
 * on the 414px default the apex — which sits near the board's top RIGHT —
 * lands off screen and every press fence would pass for the wrong reason.
 * Widened here rather than shrinking the board, so the tiles stay a size a
 * person could plausibly be looking at.
 */
async function mounted(): Promise<HTMLElement> {
  await page.viewport(1000, 800);
  container = document.createElement("div");
  container.style.width = "900px";
  document.body.appendChild(container);
  return container;
}

function tilesOf(el: HTMLElement): readonly HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>("[data-position]")];
}

function tileAt(el: HTMLElement, position: number): HTMLElement | null {
  return el.querySelector<HTMLElement>(`[data-position="${String(position)}"]`);
}

function centreOf(el: HTMLElement): { readonly x: number; readonly y: number } {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

describe("the board draws one element per position, in the layout's own order", () => {
  it("renders every position, and nothing else", async () => {
    const el = await mounted();
    createMahjongBoardRenderer()(el, fullBoard());

    const tiles = tilesOf(el);
    expect(tiles).toHaveLength(LAYOUT.length);
    expect(tiles.map((tile) => Number(tile.dataset.position))).toEqual(LAYOUT.map((_, index) => index));
  });

  it("draws no element for a position whose tile has been taken", async () => {
    const el = await mounted();
    createMahjongBoardRenderer()(el, without(fullBoard(), 0, 1));

    expect(tilesOf(el)).toHaveLength(LAYOUT.length - 2);
    expect(tileAt(el, 0)).toBeNull();
  });

  it("gives every tile its own face, at the artwork's own proportion", async () => {
    const el = await mounted();
    createMahjongBoardRenderer()(el, fullBoard());

    const apex = tileAt(el, APEX)!;
    const box = apex.getBoundingClientRect();
    // The tile's height is its width over 0.69882 — the artwork's ratio, not
    // 3:4. Nothing else in this package measures the BLOCK axis of a tile.
    expect(box.width / box.height).toBeCloseTo(TILE_ART_RATIO, 3);

    const face = apex.querySelector("img");
    expect(face).not.toBeNull();
    expect(face!.alt.length, "a face with no name is a face a screen reader cannot read").toBeGreaterThan(0);
    expect(face!.src).toContain(`${tileId(ALL_TILES[APEX]!)}.webp`);
  });

  it("draws the tile's body as a nested SVG, and no pseudo-element paints one", async () => {
    // MEASURED, AND THE INTUITION IS BACKWARDS. `::before`/`::after` look
    // free — zero extra DOM nodes — and they are not: those "zero nodes" are
    // 864 real layout boxes, and the pseudo-element board rendered SLOWER
    // (9.75ms, 288 nodes) than the nested-SVG one (7.2ms, 720 nodes). Extra
    // SVG nodes are not CSS layout boxes. Four independent runs, 2.87% pixel
    // difference, neither looking worse.
    const el = await mounted();
    createMahjongBoardRenderer()(el, fullBoard());

    const tiles = tilesOf(el);
    expect(tiles).toHaveLength(LAYOUT.length);
    for (const tile of tiles) {
      expect(tile.querySelector("svg"), "every tile carries its own body").not.toBeNull();
      expect(getComputedStyle(tile, "::before").content).toBe("none");
      expect(getComputedStyle(tile, "::after").content).toBe("none");
    }
  });
});

describe("a press finds the apex of a real turtle", () => {
  it("really is occluded — five layers contain the same point", async () => {
    // R6. On a layout where the apex overlapped nothing, "the apex wins"
    // would be true of any hit test at all.
    const el = await mounted();
    createMahjongBoardRenderer()(el, fullBoard());
    const point = centreOf(tileAt(el, APEX)!);

    const containing = tilesOf(el).filter((tile) => {
      const box = tile.getBoundingClientRect();
      return box.left <= point.x && point.x <= box.right && box.top <= point.y && point.y <= box.bottom;
    });
    expect(containing.length).toBeGreaterThanOrEqual(5);
  });

  it("and the press resolves to it", async () => {
    const el = await mounted();
    createMahjongBoardRenderer()(el, fullBoard());
    const point = centreOf(tileAt(el, APEX)!);

    expect(tileIndexAtPoint(document, point.x, point.y)).toBe(APEX);
  });

  it("hands the position back to whoever asked for it", async () => {
    const el = await mounted();
    const picked: number[] = [];
    createMahjongBoardRenderer({ onPickTile: (index) => picked.push(index) })(el, fullBoard());
    const point = centreOf(tileAt(el, APEX)!);

    tileAt(el, APEX)!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: point.x, clientY: point.y }));

    expect(picked).toEqual([APEX]);
  });
});

describe("a move removes two elements and touches nothing else", () => {
  it("every surviving tile is the SAME element it was before", async () => {
    const el = await mounted();
    const render = createMahjongBoardRenderer();
    render(el, fullBoard());

    const before = new Map(tilesOf(el).map((tile) => [Number(tile.dataset.position), tile]));
    expect(before.size, "fence setup: there has to be a board to survive").toBe(LAYOUT.length);

    render(el, without(fullBoard(), 4, 90));

    const after = tilesOf(el);
    expect(after).toHaveLength(LAYOUT.length - 2);
    for (const tile of after) {
      const position = Number(tile.dataset.position);
      expect(tile, `position ${String(position)} was re-created by a move it had nothing to do with`).toBe(before.get(position));
    }
  });

  it("and the two that were taken are gone", async () => {
    const el = await mounted();
    const render = createMahjongBoardRenderer();
    render(el, fullBoard());
    render(el, without(fullBoard(), 4, 90));

    expect(tileAt(el, 4)).toBeNull();
    expect(tileAt(el, 90)).toBeNull();
  });

  it("across a whole game, one element per position is built and never rebuilt", async () => {
    const el = await mounted();
    const render = createMahjongBoardRenderer();
    render(el, fullBoard());
    const first = tileAt(el, LAYOUT.length - 1)!;

    let tiles = fullBoard();
    for (let move = 0; move < 20; move += 1) {
      tiles = without(tiles, move * 2, move * 2 + 1);
      render(el, tiles);
    }

    expect(tilesOf(el)).toHaveLength(LAYOUT.length - 40);
    expect(tileAt(el, LAYOUT.length - 1)).toBe(first);
  });
});
