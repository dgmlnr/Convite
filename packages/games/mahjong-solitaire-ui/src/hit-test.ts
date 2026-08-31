/**
 * WHICH TILE IS UNDER THIS POINT — and the answer is "the one painted last",
 * with no `z-index` anywhere to arrange it.
 *
 * A turtle stacks five deep and every tile above the base overlaps something.
 * The obvious reflex is to give each layer a `z-index` and let the stacking
 * context sort it out; that reflex is wrong twice over. It is unnecessary —
 * for positioned elements with `z-index: auto`, DOM order IS paint order, and
 * the renderer already draws in the layout's own ascending `(z, y, x)`, so the
 * higher layer is simply later. And it is a liability — a `z-index` is a
 * second statement of the same fact, free to drift from the DOM order that is
 * actually deciding, and the repo's existing renderers deliberately carry none.
 *
 * Measured before being relied on: `elementFromPoint` returns the apex through
 * five layers of occlusion with `zIndex: auto` throughout.
 *
 * WHY `closest` AND NOT THE RETURNED ELEMENT. `elementFromPoint` answers with
 * the DEEPEST element at the point, which for a real tile is its face or a
 * node of its body — neither of which carries a layout position. The
 * stylesheet takes both out of the hit test (`pointer-events: none`), so in
 * practice the tile itself is what comes back; climbing anyway is what makes
 * this function total for a caller who never injected the sheet, and
 * `tile-stack.browser.test.ts` holds that case open on purpose rather than
 * leaving the line to be deleted as unreachable.
 */

/** The attribute a tile carries its layout position in — one literal, read by
 * the renderer that writes it and by the selector below. */
export const TILE_POSITION_ATTRIBUTE = "data-position";

/** Just enough of a `Document` (or a `ShadowRoot`) to ask the question. Narrow
 * on purpose: nothing here needs a whole document, and a structural parameter
 * is what lets a caller hand in a root that is not one. */
export interface HitTestRoot {
  elementFromPoint(x: number, y: number): Element | null;
}

/**
 * The layout position of the topmost tile at a viewport point, or `null` where
 * there is no tile at all — an empty hole, the felt around the board, a
 * position whose tile has already been taken.
 *
 * The coordinates are the browser's own viewport coordinates, the ones a
 * `PointerEvent` carries in `clientX`/`clientY`. Nothing here measures a box:
 * the question is asked of the document, and the document answers from what it
 * already painted.
 */
export function tileIndexAtPoint(root: HitTestRoot, x: number, y: number): number | null {
  const hit = root.elementFromPoint(x, y);
  const tile = hit === null ? null : hit.closest(`[${TILE_POSITION_ATTRIBUTE}]`);
  if (tile === null) return null;
  const raw = tile.getAttribute(TILE_POSITION_ATTRIBUTE);
  if (raw === null) return null;
  const index = Number.parseInt(raw, 10);
  return Number.isInteger(index) ? index : null;
}
