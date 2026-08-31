import { DRAGONS, FLOWERS, SEASONS, SUITS, SUIT_RANKS, WINDS, tileId, type Tile } from "./tile.js";

/**
 * The 42 distinct FACES, which is not the wall.
 *
 * A mahjong wall is 144 tiles — four copies of each of the 34 ordinary faces
 * plus one of each of the 8 bonus tiles — and that count belongs to the
 * engine, which deals them. Four copies of the five of circles are ONE
 * drawing, so what an art package enumerates is the drawings: 27 suit tiles,
 * 4 winds, 3 dragons, 4 flowers, 4 seasons.
 */
export const ALL_TILE_FACES: readonly Tile[] = [
  ...SUITS.flatMap((suit) => SUIT_RANKS.map((rank): Tile => ({ kind: "suit", suit, rank }))),
  ...WINDS.map((wind): Tile => ({ kind: "wind", wind })),
  ...DRAGONS.map((dragon): Tile => ({ kind: "dragon", dragon })),
  ...FLOWERS.map((flower): Tile => ({ kind: "flower", flower })),
  ...SEASONS.map((season): Tile => ({ kind: "season", season })),
];

/**
 * Every filename `assets/tiles/` may hold, DERIVED from `tileId` rather than
 * written down — and that difference is the whole reason this export exists
 * instead of a regex living at the route.
 *
 * A regex can be tested for COMPLETENESS (feed it the 42 valid names and
 * watch them pass) but never for SOUNDNESS: proving it accepts nothing else
 * means enumerating a regular language, which a test cannot do. So a route
 * guarded by a regex is guarded by a claim, and `static-deck-assets.ts:13` is
 * this repository's own instance of that claim — a hand-typed literal whose
 * comment says it is `cardId()`'s shape, in a package that does not depend on
 * the deck at all and therefore cannot check.
 *
 * A Set built from the producer is sound and complete by construction. It
 * holds these 42 strings, and by the definition of a Set it holds nothing
 * else — so `has(filename)` is a total, honest answer for every input,
 * traversal shapes included, with no pattern to reason about.
 *
 * THE COST, AND IT IS DELIBERATE: `widget-frontdoor` (L2) has to import this
 * L0 package to use it. That edge is permitted by every layer rule but it is
 * a new precedent, and the deck side is NOT retrofitted to match — merging
 * two distinct defects into one fence is how a fence stops naming what it
 * caught.
 */
export const TILE_FRONT_FILENAMES: ReadonlySet<string> = new Set(ALL_TILE_FACES.map((tile) => `${tileId(tile)}.webp`));
