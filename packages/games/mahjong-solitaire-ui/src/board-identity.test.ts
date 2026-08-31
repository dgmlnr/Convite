import { describe, expect, it } from "vitest";
import { ALL_TILES, LAYOUT, tileId } from "@hexdev/mahjong-solitaire-engine";
import type { TileId } from "@hexdev/mahjong-solitaire-engine";
import { isSameBoard } from "./board-identity.js";
import type { BoardTiles } from "./board-identity.js";

/** A dense, full board: one tile per layout position, taken from the engine's
 * own 144-tile wall in its own order. Not a deal — this file is about what a
 * RENDERER can tell from two payloads, and a deal would only make the
 * fixtures harder to read. */
function fullBoard(): BoardTiles {
  return ALL_TILES.map((tile) => tileId(tile));
}

/** The same wall, dealt into the positions in the opposite order: same
 * length, same 144 tiles, same zero nulls — and a different board. */
function reversedBoard(): BoardTiles {
  return [...ALL_TILES].reverse().map((tile) => tileId(tile));
}

/** `board` with the tiles at these positions taken off, which is the only
 * thing a legal move can ever do to one. */
function without(board: BoardTiles, ...positions: readonly number[]): BoardTiles {
  const tiles: (TileId | null)[] = [...board];
  for (const position of positions) tiles[position] = null;
  return tiles;
}

describe("the fixtures can actually disagree", () => {
  /**
   * R6, and the reason it is not optional here: every assertion below is
   * about two boards being different, and two fixtures that happen to be
   * identical would make the whole file pass against `() => true`. Sized
   * against the collection, never against a neighbouring fence's literal
   * (R14).
   */
  it("a full board is 144 tiles with no holes, and reversing it changes what is where", () => {
    expect(fullBoard()).toHaveLength(LAYOUT.length);
    expect(fullBoard().filter((tile) => tile === null)).toHaveLength(0);
    expect(reversedBoard()).toHaveLength(LAYOUT.length);
    expect(reversedBoard()[0]).not.toBe(fullBoard()[0]);
  });
});

describe("a board a move happened to is still the same board", () => {
  it("nothing changed", () => {
    expect(isSameBoard(fullBoard(), fullBoard())).toBe(true);
  });

  it("a pair came off", () => {
    expect(isSameBoard(fullBoard(), without(fullBoard(), 3, 97))).toBe(true);
  });

  it("every tile came off, one move at a time, and it was the same board the whole way", () => {
    const board = fullBoard();
    const cleared = board.map(() => null);
    expect(isSameBoard(board, cleared)).toBe(true);
  });

  it("two boards that are both already empty", () => {
    const cleared = fullBoard().map(() => null);
    expect(isSameBoard(cleared, cleared)).toBe(true);
  });
});

describe("a board a move could not have produced is a different board", () => {
  /**
   * THE MONOTONICITY IS THE WHOLE MECHANISM. A solitaire board only ever
   * LOSES tiles: no move puts one back, and there is no reshuffle, no hint
   * and no undo in this game. So "is this still the board I drew?" needs no
   * epoch id on the wire and no new view field — a position that gained a
   * tile, or changed which tile it holds, is proof by itself.
   */
  it("a position that was empty is holding a tile again", () => {
    const played = without(fullBoard(), 3, 97);
    expect(isSameBoard(played, fullBoard())).toBe(false);
  });

  it("a fresh deal of the same 144 tiles into different holes", () => {
    // THE CASE A COUNT CANNOT SEE. Same length, same number of tiles, not one
    // position gained anything — and it is a different board, because the
    // faces moved. A predicate written as "the tile count did not rise"
    // answers "same board" here, and the renderer would then keep 144
    // elements showing the previous deal's artwork.
    expect(isSameBoard(fullBoard(), reversedBoard())).toBe(false);
  });

  it("a cleared board followed by a new game", () => {
    const cleared = fullBoard().map(() => null);
    expect(isSameBoard(cleared, fullBoard())).toBe(false);
  });

  it("a payload of a different length is not this board at all", () => {
    expect(isSameBoard(fullBoard(), fullBoard().slice(0, LAYOUT.length - 1))).toBe(false);
    expect(isSameBoard(fullBoard().slice(0, LAYOUT.length - 1), fullBoard())).toBe(false);
  });
});

describe("the relation is directional, and deliberately so", () => {
  it("losing a pair is the same board forwards and a different board backwards", () => {
    const before = fullBoard();
    const after = without(before, 12);
    expect(isSameBoard(before, after)).toBe(true);
    expect(isSameBoard(after, before)).toBe(false);
  });
});
