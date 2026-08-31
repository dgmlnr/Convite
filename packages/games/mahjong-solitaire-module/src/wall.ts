import { ALL_TILES, matchKey, tileId } from "@hexdev/mahjong-solitaire-engine";
import type { MatchKey, TileId } from "@hexdev/mahjong-solitaire-engine";

/**
 * The wall, seen as the 72 PAIRS a deal has to place — one entry per pair.
 *
 * BY MATCH KEY, NOT BY TILE ID, and the eight bonus tiles are the whole
 * reason. The wall carries four copies of each of the 34 ordinary faces and
 * exactly ONE of each of the eight bonus tiles, so grouping by id gives 34
 * groups of four and eight groups of ONE — and a group of one can never be
 * paired. Grouped by `matchKey` the eight collapse into two groups of four
 * ("flower" and "season"), every group holds an even count, and the multiset
 * is pairable by construction. That is the naive-multiset-pop bug the spec
 * names, and it is invisible on the 34 ordinary faces: an implementation that
 * pops two equal ids deals 68 of the 72 pairs perfectly and leaves the bonus
 * tiles stranded.
 *
 * The evenness is asserted here rather than assumed, even though the engine's
 * own `tile.test.ts` already asserts it: a wall that could not be paired would
 * otherwise surface as a board with holes in it, three layers away from the
 * cause.
 */
export function pairKeys(): MatchKey[] {
  const counts = new Map<MatchKey, number>();
  for (const tile of ALL_TILES) {
    const key = matchKey(tile);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const keys: MatchKey[] = [];
  for (const [key, count] of counts) {
    if (count % 2 !== 0) {
      throw new Error(`mahjong-solitaire wall: match key "${key}" holds ${String(count)} tiles, which is odd — it cannot be paired`);
    }
    for (let pair = 0; pair < count / 2; pair += 1) keys.push(key);
  }
  return keys;
}

/**
 * Every concrete face a match key can be spent on.
 *
 * Two keys hold four DIFFERENT faces — the four flowers, the four seasons —
 * and the other 34 hold four copies of one face. That asymmetry is exactly why
 * a deal draws its pair by KEY first and only then takes concrete ids out of
 * that key's pool: "which two faces" is a separate question from "which two
 * positions", and only for the bonus tiles do the two answers differ.
 *
 * Derived from `ALL_TILES` through `matchKey` itself, never from a rule about
 * the shape of the id strings. A rule such as "ids starting with `flower-`
 * pair" would be a second copy of the match relation, and the two would agree
 * on today's wall and disagree silently on a later one — the same argument
 * `board.ts` already makes for its own `MATCH_KEY_BY_TILE_ID`.
 */
export function idsByMatchKey(): Map<MatchKey, TileId[]> {
  const pools = new Map<MatchKey, TileId[]>();
  for (const tile of ALL_TILES) {
    const key = matchKey(tile);
    const pool = pools.get(key);
    if (pool === undefined) pools.set(key, [tileId(tile)]);
    else pool.push(tileId(tile));
  }
  return pools;
}
