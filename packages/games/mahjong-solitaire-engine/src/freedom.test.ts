import { describe, expect, it } from "vitest";

import { isFree } from "./freedom.js";
import { LAYOUT } from "./layout.js";

/**
 * Positions are named by their half-cell coordinates, never by an index
 * literal: `isFree(1, ...)` says nothing about what sits above or beside the
 * tile, which is the only thing these tests are about. Throwing rather than
 * returning `-1` means a coordinate that stops existing fails loudly instead
 * of quietly testing a position that is not there.
 */
function at(x: number, y: number, z: number): number {
  const index = LAYOUT.findIndex((position) => position.x === x && position.y === y && position.z === z);
  if (index < 0) throw new Error(`the turtle has no position at (${x}, ${y}, ${z})`);
  return index;
}

/** Three neighbours on layer 0's top row, two half-cells apart. */
const LEFT = at(2, 0, 0);
const MIDDLE = at(4, 0, 0);
const RIGHT = at(6, 0, 0);

/** The apex and the two positions it overhangs, on layers 3 and 2. */
const APEX = at(13, 7, 4);
const UNDER_APEX = at(12, 6, 3);
const TWO_LAYERS_UNDER_APEX = at(12, 6, 2);

const WHOLE_BOARD: ReadonlySet<number> = new Set(LAYOUT.map((_position, index) => index));

describe("isFree", () => {
  it("frees a tile with nothing above it and both sides clear", () => {
    expect(isFree(MIDDLE, new Set([MIDDLE]))).toBe(true);
  });

  it("frees a tile blocked on the left only — one clear side is enough", () => {
    expect(isFree(MIDDLE, new Set([LEFT, MIDDLE]))).toBe(true);
  });

  it("frees a tile blocked on the right only — the rule is symmetric", () => {
    expect(isFree(MIDDLE, new Set([MIDDLE, RIGHT]))).toBe(true);
  });

  it("blocks a tile with a neighbour on both sides", () => {
    expect(isFree(MIDDLE, new Set([LEFT, MIDDLE, RIGHT]))).toBe(false);
  });

  it("blocks a tile with something resting on it, however clear its sides are", () => {
    // Nothing else is on the board, so both sides are as clear as they can be.
    // Covering beats clear sides; an implementation that only asks about the
    // sides frees this one.
    expect(isFree(UNDER_APEX, new Set([UNDER_APEX, APEX]))).toBe(false);
  });

  it("blocks a tile covered from two layers up, not just from the one directly above", () => {
    // `(12, 6, 3)` is deliberately NOT in this occupancy: the apex on layer 4
    // is the only thing over `(12, 6, 2)`, so a covering check written as
    // `z + 1` reports this tile free. GNOME's own `Tile.selectable` asks about
    // every higher layer, and so does this. The full turtle cannot make this
    // case — every position it covers from two layers up is also covered from
    // one — which is exactly why the occupancy is an argument.
    expect(isFree(TWO_LAYERS_UNDER_APEX, new Set([TWO_LAYERS_UNDER_APEX, APEX]))).toBe(false);
  });

  it("answers about the occupancy it was handed, not about the layout", () => {
    // The whole reason freedom takes occupancy as an argument (design D7):
    // play asks about the tiles that REMAIN, generation asks about the tiles
    // already PLACED. One predicate, opposite directions — so the same
    // position must be able to answer both ways.
    expect(isFree(MIDDLE, new Set([MIDDLE]))).toBe(true);
    expect(isFree(MIDDLE, WHOLE_BOARD)).toBe(false);
  });
});
