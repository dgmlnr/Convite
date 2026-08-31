import { LAYOUT } from "@hexdev/mahjong-solitaire-engine";
import { ALL_TILE_FACES, getTileArt, tileBodySvg, tileId } from "@hexdev/mahjong-tile-ui";
import type { Tile } from "@hexdev/mahjong-tile-ui";
import { isSameBoard } from "./board-identity.js";
import type { BoardTiles } from "./board-identity.js";
import { ensureBoardStyles } from "./board-styles.js";
import { TILE_POSITION_ATTRIBUTE, tileIndexAtPoint } from "./hit-test.js";

/**
 * The artwork for a face NAME. The engine stores names on the board and the
 * art package is addressed by `Tile` objects, so somebody has to bridge the
 * two — and this is the only tier that may, because the L0 rule forbids each
 * of them from importing the other.
 *
 * The two id conventions agreeing is therefore a fact nothing below here can
 * check. `art-agreement.test.ts` is where it stops being a hope.
 */
const FACE_BY_ID: ReadonlyMap<string, Tile> = new Map(ALL_TILE_FACES.map((tile) => [tileId(tile), tile]));

/** What a press means to whoever mounted the board. Optional: a board with no
 * callback still draws, which is what every fence in this package that is
 * about geometry rather than interaction relies on. */
export interface MahjongBoardCallbacks {
  readonly onPickTile?: (position: number) => void;
}

/** Draw this board into this container. `null` is "no board has been dealt
 * yet" — the module's own distinction, and not the same thing as an empty
 * board, which is a board somebody finished.
 *
 * `selected` is the layout position of the tile the player has pressed once
 * and not yet paired, or `null`/absent for none. IT IS A PARAMETER RATHER
 * THAN STATE THIS RENDERER KEEPS, because a selection is not a fact about the
 * board: it is a fact about a move being made, it dies with the move, and it
 * has to die with a new deal. `pair-selection.ts` decides what it is; this
 * only draws it.
 *
 * OPTIONAL, unlike `createRenderer`'s own `MatchRenderContext` one tier up,
 * and the difference is what a missing argument would MEAN. There, an absent
 * provenance lets a caller silently report a resumed match's time as a
 * result — a wrong answer wearing a right one. Here, absent means "nothing is
 * selected", which is both the honest default and a state the board spends
 * most of its life in; a caller who forgets it draws a board that never
 * lights up, which the browser fences in this package catch by pressing. */
export type MahjongBoardRenderer = (container: HTMLElement, tiles: BoardTiles | null, selected?: number | null) => void;

/**
 * THE BOARD IS BUILT ONCE AND THEN ONLY LOSES TILES — a `Map` from layout
 * position to the element drawing it, held in this closure for the life of
 * the renderer.
 *
 * EVERY OTHER RENDERER IN THIS REPOSITORY REBUILDS, and that is deliberate
 * there and deliberate not-here. `truco-ui/hand.ts` and `escoba-ui/piles.ts`
 * call `replaceChildren` and redraw from scratch on every payload, which is
 * the right call for a row of at most forty cards that needs no element
 * identity and animates nothing. This one does not, for three reasons, and
 * the order matters because only the first two are about cost:
 *
 * 1. NO GARBAGE. One game is 144 tiles and 72 moves. Rebuilding recreates
 *    every surviving tile on every one of them — 5,256 elements over a game,
 *    which is the sum of 144 minus two per move — against 144 built once and
 *    144 removed. That is 5,000 elements the collector never has to see.
 * 2. NO RE-CREATED `<img>`. A rebuilt face is a new element pointing at the
 *    same URL, which re-enters the browser's decode path; the cache spares
 *    the network and not the decode. Keeping the element keeps the decoded
 *    bitmap.
 * 3. A REMOVAL ANIMATION IS STRUCTURALLY IMPOSSIBLE AGAINST A REBUILD. There
 *    is nothing to animate OUT of a tree that has already been replaced. This
 *    board ships no removal animation today; a rebuild would make it
 *    unbuildable rather than unbuilt, and that is a different kind of missing.
 *
 * AND NOT BECAUSE `replaceChildren` MEASURED SLOW. It did not. Measured, on
 * this exact board: in place is 0.2ms per move against 6.2ms rebuilding — 31
 * times cheaper — and NO MOVE EXCEEDED A 16.7ms FRAME IN EITHER MODE. A whole
 * game rebuilt is 189.7ms of work in total. Drawing 144 tiles at all costs
 * 4.8ms, linear from 40, so the multiplier over escoba's forty-card pile is
 * about 3.6x rather than the 24x the tile count suggests.
 *
 * That sentence is in this docblock because of what happens without it. A
 * reader who finds "in place, for performance" here has been handed a false
 * premise for going and "optimising" `hand.ts` and `piles.ts`, which rebuild
 * forty nodes, need no element identity, and animate nothing. THIS IS NOT A
 * PRECEDENT FOR THE CARD RENDERERS. It is a departure from the house idiom,
 * taken for reasons that survive a faster machine.
 */
export function createMahjongBoardRenderer(callbacks: MahjongBoardCallbacks = {}): MahjongBoardRenderer {
  const elements = new Map<number, HTMLElement>();
  let surface: HTMLElement | null = null;
  let previous: BoardTiles | null = null;
  /** The element currently wearing the selection mark, so moving the mark
   * touches two elements rather than walking 144 of them on every press.
   * The ELEMENT and not the position: it is what has to be un-marked, and
   * looking it up again would ask the DOM a question this closure already
   * knows the answer to. */
  let highlighted: HTMLElement | null = null;

  function forget(container: HTMLElement): void {
    container.replaceChildren();
    elements.clear();
    surface = null;
    previous = null;
    highlighted = null;
  }

  /** Move the mark, or take it off. A position whose tile is no longer drawn
   * — it was taken while it was selected, or it belongs to a board that has
   * been rebuilt — simply leaves nothing marked, which is the same answer as
   * "nothing is selected" and needs no second branch. */
  function highlight(position: number | null | undefined): void {
    if (highlighted !== null) {
      delete highlighted.dataset.selected;
      highlighted = null;
    }
    if (position === null || position === undefined) return;
    const element = elements.get(position);
    if (element === undefined) return;
    element.dataset.selected = "true";
    highlighted = element;
  }

  function build(container: HTMLElement, tiles: BoardTiles): void {
    forget(container);

    const drawn = container.ownerDocument.createElement("div");
    drawn.className = "hexdev-mahjong-board-surface";
    // ONE LISTENER FOR THE WHOLE BOARD, on the surface rather than 144 of
    // them on the tiles: the answer comes from `elementFromPoint`, so the
    // element the event happened to land on is not what decides.
    drawn.addEventListener("pointerdown", (event: PointerEvent) => {
      const position = tileIndexAtPoint(container.ownerDocument, event.clientX, event.clientY);
      if (position !== null) callbacks.onPickTile?.(position);
    });

    for (const [position, id] of tiles.entries()) {
      if (id === null) continue;
      const element = drawTile(container.ownerDocument, position, id);
      elements.set(position, element);
      drawn.appendChild(element);
    }

    container.appendChild(drawn);
    surface = drawn;
  }

  return (container, tiles, selected) => {
    ensureBoardStyles(container.ownerDocument);
    container.className = "hexdev-mahjong-board";

    if (tiles === null) {
      forget(container);
      return;
    }

    // A rebuild is the answer to exactly three things: nothing has been drawn
    // yet, somebody else emptied the container under us, or this is not the
    // board we drew. Everything else is two elements coming off.
    if (surface === null || surface.parentElement !== container || previous === null || !isSameBoard(previous, tiles)) {
      build(container, tiles);
    } else {
      for (const [position, id] of tiles.entries()) {
        if (id !== null) continue;
        const element = elements.get(position);
        if (element === undefined) continue;
        if (element === highlighted) highlighted = null;
        element.remove();
        elements.delete(position);
      }
    }

    // AFTER the diff, always, and never conditionally: the element a mark
    // belongs on may have just been created by a rebuild, and the element it
    // was on may have just been removed by a move.
    highlight(selected);
    previous = tiles;
  };
}

/**
 * One tile: its bone, its face, and where it goes.
 *
 * THE COORDINATES ARE PUSHED IN AS CUSTOM PROPERTIES AND NEVER READ BACK.
 * `board-styles.ts` turns them into `left`/`top`; this function never asks
 * what came out. The DOM is a drawing of the board, not a second copy of it —
 * the `Map` above is the only record of what is on screen.
 *
 * DRAWN IN THE LAYOUT'S OWN `(z, y, x)` ORDER, which is what the caller's loop
 * over `tiles.entries()` gives for free, and it is the whole of the stacking
 * strategy: no `z-index` anywhere, because for positioned elements with
 * `z-index: auto` the DOM order IS the paint order, and a higher layer is
 * simply later in the layout.
 */
function drawTile(doc: Document, position: number, id: string): HTMLElement {
  const element = doc.createElement("div");
  element.className = "hexdev-mahjong-tile";
  element.setAttribute(TILE_POSITION_ATTRIBUTE, String(position));
  element.dataset.tile = id;
  const place = LAYOUT[position];
  if (place !== undefined) {
    element.style.setProperty("--mj-x", String(place.x));
    element.style.setProperty("--mj-y", String(place.y));
    element.style.setProperty("--mj-z", String(place.z));
  }

  // The bone first, so the face paints over it. `innerHTML` with generated
  // markup is this repository's own idiom for exactly this — `opponent-hand.ts`
  // and `status.ts` both mount `cardBackSvg()` the same way.
  const body = doc.createElement("div");
  body.className = "hexdev-mahjong-tile-body";
  body.innerHTML = tileBodySvg();
  element.appendChild(body);

  const face = FACE_BY_ID.get(id);
  if (face !== undefined) {
    const art = getTileArt(face);
    const image = doc.createElement("img");
    image.className = "hexdev-mahjong-tile-face";
    image.src = art.src;
    // The artwork's real pixel box, so the box the browser reserves is the box
    // the decoded image goes on to paint. 144 of them loading at once is
    // exactly the situation where an unreserved box costs a reflow.
    image.width = art.width;
    image.height = art.height;
    image.alt = art.alt;
    element.appendChild(image);
  }

  return element;
}
