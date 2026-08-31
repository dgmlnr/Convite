import { describe, expect, it } from "vitest";

import type { Position } from "./layout.js";
import { LAYOUT } from "./layout.js";

const cell = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** The four half-cells a tile at `(x, y, z)` occupies, as keys. */
function footprint({ x, y, z }: Position): readonly string[] {
  return [cell(x, y, z), cell(x + 1, y, z), cell(x, y + 1, z), cell(x + 1, y + 1, z)];
}

const OCCUPIED_CELLS = new Set(LAYOUT.flatMap(footprint));

/**
 * Freedom on a FULL board, transcribed from GNOME's own `Tile.selectable`
 * (`gnome-mahjongg/src/game.vala`), not guessed: a tile is free when nothing
 * overlaps its footprint on ANY higher layer — not just `z + 1` — and it is
 * not blocked on both sides at its own layer, where a side blocker is a tile
 * two half-cells across whose rows overlap (`|dy| <= 1`).
 *
 * THIS PREDICATE IS TEMPORARY AND KNOWS IT. The shipped `isFree(position,
 * occupied)` is slice 4's (design D7: freedom takes occupancy as an argument,
 * because play reads the remaining tiles and generation reads the placed
 * ones). Until it exists, the layout's own playability invariant has nothing
 * to call, so it calls this. When `freedom.ts` lands, DELETE this function and
 * point the two tests below at it — two copies of a rule are two chances to
 * disagree about it.
 */
function isFreeOnAFullBoard(tile: Position): boolean {
  const coveredAbove = LAYOUT.some((other) => other.z > tile.z && Math.abs(other.x - tile.x) <= 1 && Math.abs(other.y - tile.y) <= 1);
  const blockedAt = (dx: number): boolean =>
    LAYOUT.some((other) => other.z === tile.z && other.x === tile.x + dx && Math.abs(other.y - tile.y) <= 1);
  return !coveredAbove && !(blockedAt(-2) && blockedAt(2));
}

describe("the turtle layout", () => {
  it("holds exactly 144 distinct positions, in a stable (z, y, x) order", () => {
    expect(LAYOUT).toHaveLength(144);
    expect(new Set(LAYOUT.map((position) => cell(position.x, position.y, position.z))).size).toBe(144);

    // The order is contract, not cosmetics: a position's index is how a board
    // addresses it, so a re-ordered row re-labels every tile after it.
    const ordered = [...LAYOUT].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
    expect(LAYOUT).toEqual(ordered);
  });

  it("never lets two tiles on the same layer share a half-cell", () => {
    const cells = LAYOUT.flatMap(footprint);

    // Sized against LAYOUT itself, never against the literal 144: this fence
    // is about overlap, and re-asserting the count here would make every
    // count mutation red it too, which is exactly what it did the first time.
    expect(cells).toHaveLength(LAYOUT.length * 4);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it("backs every raised tile with four half-cells on the layer below", () => {
    const raised = LAYOUT.filter((position) => position.z > 0);

    // Size first: this loop proves nothing over an empty collection.
    expect(raised).toHaveLength(57);
    for (const position of raised) {
      const support = footprint({ ...position, z: position.z - 1 });
      const missing = support.filter((key) => !OCCUPIED_CELLS.has(key));
      expect(missing, `(${position.x}, ${position.y}, ${position.z}) rests on nothing at ${missing.join(" ")}`).toEqual([]);
    }
  });

  it("uses contiguous layer indices from zero", () => {
    const layers = [...new Set(LAYOUT.map((position) => position.z))].sort((a, b) => a - b);
    expect(layers).toEqual([...layers.keys()]);
  });

  it("spans 15 tile-columns and 8 tile-rows — the folklore 12 is the shell body without the arms", () => {
    const xs = LAYOUT.map((position) => position.x);
    const ys = LAYOUT.map((position) => position.y);

    // +2 because a tile's footprint is two half-cells wide and two tall.
    expect((Math.max(...xs) + 2 - Math.min(...xs)) / 2).toBe(15);
    expect((Math.max(...ys) + 2 - Math.min(...ys)) / 2).toBe(8);
  });
});

describe("freedom on a full turtle", () => {
  const free = LAYOUT.filter(isFreeOnAFullBoard);

  /**
   * DECLARED, NOT DRESSED UP (archive §6 rung 4): this invariant has no
   * isolating mutation because it has no counter-example at all. Take any
   * non-empty layout, take its highest layer, take the smallest x on that
   * layer: nothing sits above it (no higher layer exists) and nothing sits two
   * half-cells to its left (no smaller x on that layer), so it is free. Every
   * non-empty layout offers a first move, whatever else is wrong with it.
   *
   * Kept because the design names it, and because it is the only thing that
   * makes the predicate run at all — but the assertions that can actually FAIL
   * are the two below it.
   */
  it("offers at least one free position", () => {
    expect(free.length).toBeGreaterThan(0);
  });

  it("does not report the whole board free, so the predicate discriminates", () => {
    expect(free.length).toBeLessThan(LAYOUT.length);
  });

  it("reads the half-row arms with no special case: the left arm blocks the shell tile beside it", () => {
    const keys = new Set(free.map((position) => cell(position.x, position.y, position.z)));

    // The arm itself is free: nothing above it, nothing two half-cells to its
    // left. The positive control — without it, an always-false predicate would
    // satisfy the assertion below and prove nothing.
    expect(keys.has(cell(0, 7, 0))).toBe(true);

    // And it is what blocks (2, 6, 0)'s left, across a HALF row: |7 - 6| = 1.
    // A whole-tile model cannot express that overlap and reports this tile
    // free. This single case is why the coordinates are half-tiles.
    expect(keys.has(cell(2, 6, 0))).toBe(false);
  });
});
