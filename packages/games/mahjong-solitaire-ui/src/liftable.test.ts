import { LAYOUT, isFree } from "@hexdev/mahjong-solitaire-engine";
import { describe, expect, it } from "vitest";
import type { BoardTiles } from "./board-identity.js";
import { liftablePositions } from "./liftable.js";

/**
 * A board is `BoardTiles` — one slot per layout position, `null` where a tile
 * has been taken. That array IS the occupancy the engine's `isFree` asks for,
 * once the nulls are dropped, and this file exists to pin that translation
 * rather than the freedom rule itself. The rule has its own tests one package
 * down (`freedom.test.ts`); re-asserting it here would be a second, drifting
 * statement of somebody else's invariant.
 */
function fullBoard(): BoardTiles {
  return LAYOUT.map(() => "1-bamboo");
}

function boardWithout(taken: readonly number[]): BoardTiles {
  const tiles = [...fullBoard()];
  for (const position of taken) tiles[position] = null;
  return tiles;
}

describe("liftablePositions — which tiles the player may pick up right now", () => {
  it("agrees with the engine on a full turtle, position for position", () => {
    const tiles = fullBoard();
    const occupied = new Set(LAYOUT.map((_, index) => index));
    const liftable = liftablePositions(tiles);

    for (let position = 0; position < LAYOUT.length; position += 1) {
      expect(liftable.has(position)).toBe(isFree(position, occupied));
    }
    // The count the layout's own docstring records, restated here only as a
    // tripwire on the translation: if the array-to-set step ever dropped or
    // invented an entry, every per-position assertion above could still pass
    // on a set that is subtly the wrong size.
    expect(liftable.size).toBe(35);
  });

  it("never names a position whose tile has already been taken", () => {
    const taken = [...liftablePositions(fullBoard())].slice(0, 4);
    const liftable = liftablePositions(boardWithout(taken));
    for (const position of taken) expect(liftable.has(position)).toBe(false);
  });

  it("frees what removing a tile uncovers — an empty board leaves nothing to lift", () => {
    const everything = LAYOUT.map((_, index) => index);
    expect(liftablePositions(boardWithout(everything)).size).toBe(0);
  });

  it("frees a buried tile once the tiles above it are gone — uncovering is what makes a turtle finishable", () => {
    // The apex sits alone on z=4 over the centre of the shell, so every tile
    // it covers is buried on a full board by construction. Taking it off has
    // to hand at least one of them back, and NOT asserting a count is the
    // point: how many appear is a fact about the turtle, while "removing the
    // cover uncovers" is the fact about this function.
    const apex = LAYOUT.findIndex((position) => position.z === 4);
    expect(apex).toBeGreaterThanOrEqual(0);

    const before = liftablePositions(fullBoard());
    const after = liftablePositions(boardWithout([apex]));
    const uncovered = [...after].filter((position) => !before.has(position));

    expect(before.has(apex)).toBe(true);
    expect(uncovered.length).toBeGreaterThan(0);
    // Everything the apex uncovered was under it, never beside it: covering is
    // a relation between layers, and a set that grew sideways would mean the
    // occupancy handed to `isFree` had lost a tile it should still hold.
    for (const position of uncovered) expect(LAYOUT[position].z).toBeLessThan(4);
  });
});
