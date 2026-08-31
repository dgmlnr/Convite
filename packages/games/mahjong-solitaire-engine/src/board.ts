import { isFree } from "./freedom.js";
import type { PlayerId } from "./ids.js";
import { LAYOUT } from "./layout.js";
import type { MatchKey, Tile, TileId } from "./tile.js";
import { ALL_TILES, matchKey, tileId } from "./tile.js";

/**
 * A solitaire board: who is playing it, and what is still on it.
 *
 * `tiles` is DENSE — exactly one entry per `LAYOUT` position, `null` where the
 * tile has been taken. An index into it IS a position, which is only true
 * because `LAYOUT`'s `(z, y, x)` order is contract and `layout.test.ts`
 * asserts it. A sparse map keyed by position would have been the same
 * information, and would have let a renderer and an engine disagree about
 * whether a missing key means "empty" or "not part of this board".
 *
 * THERE IS NO `won`, NO `lost` AND NO `deadlocked` FIELD, and there is not
 * going to be one. `getOutcome` derives all three from the tiles, which is the
 * same argument `platform-contract` already makes for leaving `isTerminal` off
 * the port: a stored boolean is a second source of truth that can drift from
 * the first, and every producer of a state then has to remember to maintain
 * it. `board.test.ts`'s round trip is what holds this — it asserts the whole
 * key set, so a field that named the outcome would be caught by its presence
 * rather than by somebody noticing it was stale.
 */
export interface MatchState {
  readonly playerId: PlayerId;
  readonly tiles: readonly (TileId | null)[];
}

/** Take these two tiles off the board. `a` is always the lower index. */
export interface RemovePairAction {
  readonly type: "remove-pair";
  readonly playerId: PlayerId;
  readonly a: number;
  readonly b: number;
}

/** Shaped like `platform-contract`'s own `MatchOutcome`, which this package
 * may not import (L0). An empty `winnerIds` is legitimate and is what a board
 * nobody solved reports. */
export interface MatchOutcome {
  readonly winnerIds: readonly PlayerId[];
}

/**
 * The match relation, indexed the way a laid board addresses it.
 *
 * A board stores face NAMES, not `Tile` objects, so the relation has to be
 * reachable from a name. Derived from `ALL_TILES` through `matchKey` itself —
 * 144 tiles collapsing to 42 keys — rather than re-stated as a rule about the
 * shape of the strings. A second rule ("ids starting with `flower-` pair") is
 * a second chance to disagree with the first, and it is the disagreement
 * nobody would ever see: both agree on this wall, today.
 */
const MATCH_KEY_BY_TILE_ID: ReadonlyMap<TileId, MatchKey> = new Map(ALL_TILES.map((tile: Tile) => [tileId(tile), matchKey(tile)]));

/**
 * Lay a dealt board out. `placements[i]` is the tile at `LAYOUT[i]`.
 *
 * The length check is the whole reason this is a function rather than an
 * object literal at the call site. A placement list one entry short does not
 * fail: it silently re-addresses every position after the gap, and the board
 * still plays — with the wrong tiles in the wrong holes and a shape nobody
 * asked for. The copy is the other reason: a caller that keeps its array and
 * writes to it later would be writing into a `readonly` state.
 */
export function layBoard(playerId: PlayerId, placements: readonly (TileId | null)[]): MatchState {
  if (placements.length !== LAYOUT.length) {
    throw new Error(`a board needs one placement per position: got ${placements.length}, the turtle has ${LAYOUT.length}`);
  }
  return { playerId, tiles: [...placements] };
}

/**
 * Every pair of free tiles that match — and that list being empty is what a
 * deadlock IS. One rule, not two.
 *
 * That asymmetry is the point of the whole design: detecting that no move
 * exists is linear in the board, while deciding whether a board can be
 * FINISHED is NP-complete (de Bondt, arXiv:1203.6559). Reverse generation
 * answers the hard question on the way in, so nothing here ever has to. There
 * is no recursion below, no backtracking and no retry — two nested loops over
 * at most 144 free tiles, and that is the entire search this game does.
 *
 * The pairs come out in ascending `(a, b)` order because `occupied` is filled
 * by an ascending scan and never re-ordered. Determinism is not decoration
 * here: a bot, a golden and a replay all compare these lists.
 */
export function getLegalActions(state: MatchState, playerId: PlayerId): readonly RemovePairAction[] {
  if (playerId !== state.playerId) return [];

  const occupied = new Set<number>();
  for (let index = 0; index < state.tiles.length; index += 1) {
    if (state.tiles[index] !== null) occupied.add(index);
  }

  const free: { readonly index: number; readonly key: MatchKey }[] = [];
  for (const index of occupied) {
    const id = state.tiles[index];
    if (id === null || !isFree(index, occupied)) continue;
    const key = MATCH_KEY_BY_TILE_ID.get(id);
    // A name the wall cannot produce has no match key, so it pairs with
    // nothing. Unreachable from a real deal; a silently self-matching unknown
    // would not be.
    if (key !== undefined) free.push({ index, key });
  }

  const actions: RemovePairAction[] = [];
  for (let first = 0; first < free.length; first += 1) {
    for (let second = first + 1; second < free.length; second += 1) {
      if (free[first].key !== free[second].key) continue;
      actions.push({ type: "remove-pair", playerId, a: free[first].index, b: free[second].index });
    }
  }
  return actions;
}

/**
 * Cleared board, the player wins. Tiles left and nothing to take, nobody wins.
 * Anything else, the match is still going.
 *
 * The loss is `{ winnerIds: [] }` rather than a `lost: true`, and that is the
 * contract's own wording, not an improvisation: `MatchOutcome.winnerIds` "may
 * legitimately be empty — a draw, or a solo match abandoned unsolved". The
 * middle branch reads the SAME list `getLegalActions` offers the player, so
 * "there is nothing to do" and "the match is over" cannot come apart.
 */
export function getOutcome(state: MatchState): MatchOutcome | null {
  if (state.tiles.every((tile) => tile === null)) return { winnerIds: [state.playerId] };
  if (getLegalActions(state, state.playerId).length === 0) return { winnerIds: [] };
  return null;
}
