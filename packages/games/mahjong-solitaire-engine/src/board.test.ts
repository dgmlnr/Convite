import { describe, expect, it } from "vitest";

import type { MatchState } from "./board.js";
import { getLegalActions, getOutcome, layBoard } from "./board.js";
import type { PlayerId } from "./ids.js";
import { LAYOUT } from "./layout.js";
import type { Tile, TileId } from "./tile.js";
import { tileId } from "./tile.js";

const PLAYER = "player-0" as PlayerId;
const STRANGER = "player-1" as PlayerId;

/** Named by coordinates rather than by index, for `freedom.test.ts`'s reason. */
function at(x: number, y: number, z: number): number {
  const index = LAYOUT.findIndex((position) => position.x === x && position.y === y && position.z === z);
  if (index < 0) throw new Error(`the turtle has no position at (${x}, ${y}, ${z})`);
  return index;
}

const MIDDLE = at(4, 0, 0);
const FAR_RIGHT = at(24, 0, 0);
const LOW_ROW = at(4, 14, 0);
const UNDER_APEX = at(12, 6, 3);
const APEX = at(13, 7, 4);

const CIRCLES_5: Tile = { kind: "suit", suit: "circles", rank: 5 };
const BAMBOO_5: Tile = { kind: "suit", suit: "bamboo", rank: 5 };
const PLUM: Tile = { kind: "flower", flower: "plum" };
const ORCHID: Tile = { kind: "flower", flower: "orchid" };
const SPRING: Tile = { kind: "season", season: "spring" };

/**
 * A board built as a plain state, NOT through `layBoard`. Deliberate: a stored
 * outcome flag maintained by the constructor would agree with itself forever,
 * so every fence about the outcome being DERIVED has to be able to hand
 * `getOutcome` a state that no constructor blessed — which is exactly what a
 * state that has had tiles removed from it is.
 */
function board(...placed: readonly (readonly [number, Tile])[]): MatchState {
  const tiles: (TileId | null)[] = LAYOUT.map(() => null);
  for (const [index, tile] of placed) tiles[index] = tileId(tile);
  return { playerId: PLAYER, tiles };
}

describe("layBoard", () => {
  it("keeps one entry per layout position, so an index IS a position", () => {
    const placements: (TileId | null)[] = LAYOUT.map(() => null);
    placements[MIDDLE] = tileId(CIRCLES_5);
    placements[APEX] = tileId(PLUM);

    const state = layBoard(PLAYER, placements);

    expect(state.playerId).toBe(PLAYER);
    expect(state.tiles).toHaveLength(LAYOUT.length);
    expect(state.tiles[MIDDLE]).toBe("5-circles");
    expect(state.tiles[APEX]).toBe("flower-plum");
    expect(state.tiles.filter((tile) => tile !== null)).toHaveLength(2);
  });

  it("refuses a placement list that is not one entry per position", () => {
    // A short list would not fail loudly on its own: it would silently
    // re-address every tile after the gap, and the board would still play.
    expect(() => layBoard(PLAYER, LAYOUT.slice(1).map(() => null))).toThrow(/143.*144|144.*143/);
  });

  it("copies the placements instead of adopting the caller's array", () => {
    const placements: (TileId | null)[] = LAYOUT.map(() => null);
    const state = layBoard(PLAYER, placements);

    placements[MIDDLE] = tileId(CIRCLES_5);

    expect(state.tiles[MIDDLE]).toBeNull();
  });
});

describe("getLegalActions", () => {
  it("offers a pair of free tiles that match", () => {
    const state = board([MIDDLE, CIRCLES_5], [FAR_RIGHT, CIRCLES_5]);

    expect(getLegalActions(state, PLAYER)).toEqual([{ type: "remove-pair", playerId: PLAYER, a: MIDDLE, b: FAR_RIGHT }]);
  });

  it("offers nothing when the free tiles share no match key", () => {
    const state = board([MIDDLE, CIRCLES_5], [FAR_RIGHT, BAMBOO_5]);

    expect(getLegalActions(state, PLAYER)).toEqual([]);
  });

  it("will not pair a matching tile that is not free", () => {
    // Three fives of circles. The apex sits on `(12, 6, 3)`, so that one is
    // covered and cannot be part of anything; the other two can pair with each
    // other. One action, not three.
    const state = board([MIDDLE, CIRCLES_5], [UNDER_APEX, CIRCLES_5], [APEX, CIRCLES_5]);

    expect(getLegalActions(state, PLAYER)).toEqual([{ type: "remove-pair", playerId: PLAYER, a: MIDDLE, b: APEX }]);
  });

  it("offers EVERY free matching pair, not just the first one it finds", () => {
    // Deadlock is "this list is empty", so a list that stops early is a
    // deadlock the player does not have.
    const state = board([MIDDLE, CIRCLES_5], [FAR_RIGHT, CIRCLES_5], [LOW_ROW, CIRCLES_5]);

    expect(getLegalActions(state, PLAYER)).toEqual([
      { type: "remove-pair", playerId: PLAYER, a: MIDDLE, b: FAR_RIGHT },
      { type: "remove-pair", playerId: PLAYER, a: MIDDLE, b: LOW_ROW },
      { type: "remove-pair", playerId: PLAYER, a: FAR_RIGHT, b: LOW_ROW },
    ]);
  });

  it("pairs bonus tiles by match key, never by identity", () => {
    // A plum and an orchid are different tiles and different pictures, and
    // they pair. A flower and a season are both bonus tiles, and they do not.
    expect(getLegalActions(board([MIDDLE, PLUM], [FAR_RIGHT, ORCHID]), PLAYER)).toHaveLength(1);
    expect(getLegalActions(board([MIDDLE, PLUM], [FAR_RIGHT, SPRING]), PLAYER)).toEqual([]);
  });

  it("offers nothing to somebody who is not sitting at that board", () => {
    const state = board([MIDDLE, CIRCLES_5], [FAR_RIGHT, CIRCLES_5]);

    expect(getLegalActions(state, STRANGER)).toEqual([]);
    // The control: the same board, the same instant, one legal move for the
    // player whose board it is. Without it a function returning `[]` for
    // everyone would pass the assertion above.
    expect(getLegalActions(state, PLAYER)).toHaveLength(1);
  });
});

describe("getOutcome", () => {
  it("hands the board to the player who cleared it", () => {
    expect(getOutcome(board())).toEqual({ winnerIds: [PLAYER] });
  });

  it("ends a board with tiles left and no free pair, with nobody winning", () => {
    // `MatchOutcome.winnerIds` is documented as legitimately empty for exactly
    // this — "a draw, or a solo match abandoned unsolved". There is no won or
    // lost boolean anywhere, and there is not going to be one.
    expect(getOutcome(board([MIDDLE, CIRCLES_5], [FAR_RIGHT, BAMBOO_5]))).toEqual({ winnerIds: [] });
  });

  it("says nothing at all while a pair is still on the table", () => {
    expect(getOutcome(board([MIDDLE, CIRCLES_5], [FAR_RIGHT, CIRCLES_5]))).toBeNull();
  });

  it("still reports the loss after a round trip, and no stored field says so", () => {
    // Built by `layBoard`, NOT by this file's `board` helper, and the
    // difference is the whole test. A key-set assertion over a state this file
    // assembled itself can only ever read back the two keys this file put
    // there — it would be green against any production code at all. Only a
    // state a PRODUCER built can say what a producer stores. Measured, not
    // reasoned: the first version of this fence used `board` and could not
    // fail.
    const placements: (TileId | null)[] = LAYOUT.map(() => null);
    placements[MIDDLE] = tileId(CIRCLES_5);
    placements[FAR_RIGHT] = tileId(BAMBOO_5);
    const restored = JSON.parse(JSON.stringify(layBoard(PLAYER, placements))) as MatchState;

    expect(getOutcome(restored)).toEqual({ winnerIds: [] });
    // The seat and the tiles, and nothing else. Removing any single serialized
    // field cannot change the verdict, because no field names it.
    expect(Object.keys(restored).sort()).toEqual(["playerId", "tiles"]);
  });
});
