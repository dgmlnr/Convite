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

/** The same 144 tiles in the opposite order: same length, same faces, no
 * holes — and a board the renderer has to rebuild rather than diff. */
function reshuffledBoard(): BoardTiles {
  return layBoard(PLAYER, [...ALL_TILES].reverse().map((tile) => tileId(tile))).tiles;
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

/**
 * THE PRESS THAT HAS NOT BECOME A MOVE YET.
 *
 * `pair-selection.ts` decides WHICH tile is selected; this is the half that
 * makes the answer visible, and it is the half a rule cannot be tested
 * through. Without it the first of the two presses a move is made of leaves
 * the board looking exactly as it did — the player is told nothing, and the
 * one interaction this game has becomes guesswork.
 *
 * ASSERTED ON THE ATTRIBUTE AND ON A COMPUTED STYLE, because either alone is
 * a half-fence: the attribute alone says nothing about anything being drawn
 * differently, and a sheet rule alone says nothing about the right tile
 * carrying it.
 */
describe("the selected tile says so", () => {
  it("marks exactly the selected tile, and nothing else", async () => {
    const el = await mounted();
    createMahjongBoardRenderer()(el, fullBoard(), 7);

    const marked = [...el.querySelectorAll<HTMLElement>("[data-selected]")];
    expect(marked).toHaveLength(1);
    expect(Number(marked[0]!.dataset.position)).toBe(7);
  });

  it("draws it differently, rather than only labelling it", async () => {
    const el = await mounted();
    createMahjongBoardRenderer()(el, fullBoard(), 7);

    const selected = getComputedStyle(tileAt(el, 7)!).filter;
    const plain = getComputedStyle(tileAt(el, 8)!).filter;

    // The sheet paints the selection with a drop-shadow halo that follows
    // the tile's own rounded silhouette — a rectangular outline around a
    // rounded tile reads as a rendering fault, and a colour change would
    // fight artwork this package does not own.
    expect(selected, `the selected tile computed "${selected}", the same as an unselected one`).not.toBe(plain);
    expect(selected).toContain("drop-shadow");
    expect(plain, "an unselected tile is not glowing").toBe("none");
  });

  it("moves the mark when the selection moves, leaving nothing behind", async () => {
    const el = await mounted();
    const render = createMahjongBoardRenderer();
    render(el, fullBoard(), 7);
    render(el, fullBoard(), 12);

    const marked = [...el.querySelectorAll<HTMLElement>("[data-selected]")];
    expect(marked, "the previous selection stayed lit").toHaveLength(1);
    expect(Number(marked[0]!.dataset.position)).toBe(12);
  });

  it("clears the mark when nothing is selected", async () => {
    const el = await mounted();
    const render = createMahjongBoardRenderer();
    render(el, fullBoard(), 7);
    render(el, fullBoard(), null);

    expect(el.querySelectorAll("[data-selected]")).toHaveLength(0);
  });

  it("marks nothing at all when the caller says nothing about a selection", async () => {
    const el = await mounted();
    createMahjongBoardRenderer()(el, fullBoard());

    expect(el.querySelectorAll("[data-selected]"), "a board drawn with no selection is a board with no selection").toHaveLength(0);
  });

  it("keeps the mark across an in-place removal of two OTHER tiles", async () => {
    // The ordinary case a mahjong board spends its whole life in: the two
    // that came off are gone, the one the player has since picked stays lit,
    // and the 141 in between are the same elements they always were.
    const el = await mounted();
    const render = createMahjongBoardRenderer();
    render(el, fullBoard(), null);
    const kept = tileAt(el, 7)!;
    render(el, without(fullBoard(), 0, 1), 7);

    expect(tileAt(el, 7), "the board rebuilt when it only needed to lose two tiles").toBe(kept);
    expect(kept.dataset.selected).toBe("true");
  });

  it("carries no mark into a board it had to rebuild", async () => {
    // A new deal is a different board, so the renderer rebuilds — and a
    // selection is about the board that is gone. Nothing on screen is the
    // element that was lit.
    const el = await mounted();
    const render = createMahjongBoardRenderer();
    render(el, fullBoard(), 7);
    render(el, reshuffledBoard(), null);

    expect(el.querySelectorAll("[data-selected]")).toHaveLength(0);
  });
});

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

describe("a board that is not the same board is rebuilt", () => {
  it("a fresh deal replaces every element and shows the new faces", async () => {
    const el = await mounted();
    const render = createMahjongBoardRenderer();
    render(el, fullBoard());
    const before = tileAt(el, 0)!;
    const beforeTile = before.dataset.tile;

    render(el, reshuffledBoard());

    const after = tileAt(el, 0)!;
    expect(after).not.toBe(before);
    expect(after.dataset.tile).not.toBe(beforeTile);
    expect(tilesOf(el)).toHaveLength(LAYOUT.length);
  });

  it("a board that went away leaves nothing behind, and the next one is built fresh", async () => {
    const el = await mounted();
    const render = createMahjongBoardRenderer();
    render(el, fullBoard());
    const before = tileAt(el, 0)!;

    render(el, null);
    expect(tilesOf(el)).toHaveLength(0);

    render(el, fullBoard());
    expect(tilesOf(el)).toHaveLength(LAYOUT.length);
    expect(tileAt(el, 0)).not.toBe(before);
  });
});
