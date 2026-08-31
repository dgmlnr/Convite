import type { Position } from "./layout.js";
import { LAYOUT } from "./layout.js";

/**
 * A tile is free when nothing is on top of it AND it can slide out to the
 * left OR to the right. Not both — the "or" is the whole rule, and getting it
 * wrong is the classic way to build a board nobody can finish. Sourced from
 * Tom Sloper's mahjong FAQ entry 13, which states it as "no tile on top of it,
 * and either its left or its right side is open"; Wikipedia's mahjong
 * solitaire article agrees, and so does every implementation below.
 *
 * BLOCKED FROM ABOVE MEANS ANY HIGHER LAYER, NOT JUST `z + 1`. Taken from
 * GNOME's own `Tile.selectable` (`gnome-mahjongg/src/game.vala`), which walks
 * every tile with a greater `z`. On the classic turtle the distinction is
 * invisible — every position it covers from two layers up is also covered
 * from one — so a `z + 1` implementation passes on this layout and breaks the
 * moment the data changes. `freedom.test.ts` builds the counter-example by
 * hand, which it can only do because the occupancy is an argument.
 *
 * SUPPORT AND COVERING ARE DIFFERENT RELATIONS AND MUST NOT BE UNIFIED.
 * `layout.test.ts`'s third invariant asks whether a raised tile's four
 * half-cells are backed on `z - 1` exactly. This asks whether anything
 * overlaps on ANY `z' > z`. A tile can rest on the layer below while being
 * covered by one two layers up; both questions are correct, and they are not
 * the same question.
 *
 * SIDES ARE COLUMNS, NOT NEIGHBOURS AT `x ± 2`. A tile at `(x, y, z)` occupies
 * half-cell columns `x..x+1`; its left side is clear when no tile on its own
 * layer occupies column `x - 1`, and its right side when none occupies column
 * `x + 2`. Written that way, any legal half-cell spacing reads correctly —
 * `x ± 2` happens to agree on the turtle only because every tile on a given
 * layer there shares one parity of `x`. Rows overlap when `|dy| <= 1`, since a
 * footprint is two half-rows tall: that single fact is what lets the turtle's
 * half-row arms block the shell tiles beside them with no special case.
 *
 * THE OCCUPANCY IS AN ARGUMENT, DELIBERATELY (design D7). Play asks about the
 * tiles that REMAIN on the board; reverse generation asks about the tiles
 * already PLACED. Same predicate, opposite directions — a signature that read
 * the occupancy off a board state could serve only one of them.
 */
export function isFree(index: number, occupied: ReadonlySet<number>): boolean {
  const tile = LAYOUT[index];
  if (coveredFromAbove(tile, index, occupied)) return false;
  return !(blocksColumn(tile, index, occupied, tile.x - 1) && blocksColumn(tile, index, occupied, tile.x + 2));
}

/** Does anything in `occupied` overlap this footprint on a HIGHER layer? */
function coveredFromAbove(tile: Position, index: number, occupied: ReadonlySet<number>): boolean {
  for (const other of occupied) {
    if (other === index) continue;
    const candidate = LAYOUT[other];
    if (candidate.z > tile.z && Math.abs(candidate.x - tile.x) <= 1 && Math.abs(candidate.y - tile.y) <= 1) return true;
  }
  return false;
}

/** Does anything in `occupied` fill `column` on this tile's own layer? */
function blocksColumn(tile: Position, index: number, occupied: ReadonlySet<number>, column: number): boolean {
  for (const other of occupied) {
    if (other === index) continue;
    const candidate = LAYOUT[other];
    if (candidate.z === tile.z && candidate.x <= column && column <= candidate.x + 1 && Math.abs(candidate.y - tile.y) <= 1) return true;
  }
  return false;
}
