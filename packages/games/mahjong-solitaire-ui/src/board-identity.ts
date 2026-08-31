import type { TileId } from "@hexdev/mahjong-solitaire-engine";

/**
 * A board as the renderer receives it: one entry per layout position, `null`
 * where the tile has been taken. The engine's `MatchState.tiles` in exactly
 * that shape, and the module hands it straight through — an index IS a
 * position, which is what makes a `Map<positionIndex, HTMLElement>` a
 * complete description of what is on screen.
 */
export type BoardTiles = readonly (TileId | null)[];

/**
 * IS THIS STILL THE BOARD I DREW? — the question in-place diffing has to
 * answer before it may keep a single element.
 *
 * A renderer that removes only what disappeared is right exactly as long as
 * the two payloads describe the same deal. Hand it a NEW deal and it would
 * leave 144 elements on screen showing the previous game's artwork, silently:
 * no error, no blank, just the wrong board. So there has to be a rule, and
 * the interesting part is that it needs nothing new on the wire.
 *
 * IT IS DERIVED FROM THE GAME'S OWN MONOTONICITY. A solitaire board only ever
 * LOSES tiles — no move puts one back, and this game ships no reshuffle, no
 * hint and no undo. So every legal successor of a board agrees with it
 * everywhere it still has a tile, and differs only by having fewer. Anything
 * else is a different board:
 *
 *   - a payload of a different length is not this layout at all;
 *   - a position that was empty and is holding a tile again cannot have got
 *     there by a move;
 *   - a position holding a DIFFERENT tile than before is a different deal,
 *     even though nothing was added and nothing was taken away.
 *
 * THAT THIRD CASE IS WHY THIS IS NOT A COUNT. "The tile count did not rise"
 * is the obvious formulation and it is wrong: two deals of the same 144 tiles
 * into the same 144 holes have identical counts and identical hole patterns,
 * and they are not the same board. Comparing the tiles themselves costs one
 * pass over an array that is already in hand and answers all three cases with
 * one rule.
 *
 * NO EPOCH ID, NO NEW VIEW FIELD, and that is the point: adding one would put
 * a renderer's implementation detail on the wire and into the engine's state,
 * where every producer would then have to remember to maintain it — the same
 * argument the engine already makes for having no `won` or `lost` field.
 *
 * DIRECTIONAL, on purpose. `isSameBoard(before, after)` asks whether `after`
 * could have come from `before`; the reverse is a different question and gets
 * a different answer. The renderer only ever asks it one way, from what it
 * last drew to what just arrived.
 */
export function isSameBoard(previous: BoardTiles, next: BoardTiles): boolean {
  if (previous.length !== next.length) return false;
  for (let index = 0; index < next.length; index += 1) {
    const arriving = next[index];
    if (arriving !== null && arriving !== previous[index]) return false;
  }
  return true;
}
