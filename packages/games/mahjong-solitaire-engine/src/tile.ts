/**
 * Tile identity and the match relation, declared HERE and imported from
 * nowhere.
 *
 * `packages/games/*-engine` is L0 by glob — `.dependency-cruiser.cjs`'s
 * `l0-game-engine-no-workspace-deps` forbids a game engine EVERY workspace
 * import, `@hexdev/platform-contract` included — so this package structurally
 * cannot reach the tile-art package that will draw these faces, nor the
 * platform that will run them. `matchKey` living in the engine is therefore
 * decided by a fence, not by taste. Same reasoning, same wording, as
 * `escoba-engine/src/card.ts`'s own header: the art package will re-declare
 * this shape rather than import it, and the two are kept structurally
 * identical on purpose so no adapter is ever needed between them.
 *
 * THE WALL IS NOT "four copies of everything". It is four copies of each of
 * the 34 ordinary faces (136) plus ONE copy of each of the 8 bonus tiles
 * (4 flowers, 4 seasons) = 144. The domain source used for the match relation
 * (Tom Sloper's mahjong FAQ, entry 13) states the relation correctly and the
 * count wrongly — it says "there are four identical copies of each tile type",
 * which is false for the bonus tiles. `tile.test.ts` asserts the two counts
 * separately so the wrong half can never be quietly adopted.
 */

export type Suit = "circles" | "bamboo" | "characters";
export type SuitRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Wind = "east" | "south" | "west" | "north";
export type Dragon = "red" | "green" | "white";

/** 梅 蘭 菊 竹 — plum, orchid, chrysanthemum, bamboo. */
export type Flower = "plum" | "orchid" | "chrysanthemum" | "bamboo";

/** 春 夏 秋 冬 — spring, summer, autumn, winter. */
export type Season = "spring" | "summer" | "autumn" | "winter";

export type Tile =
  | { readonly kind: "suit"; readonly suit: Suit; readonly rank: SuitRank }
  | { readonly kind: "wind"; readonly wind: Wind }
  | { readonly kind: "dragon"; readonly dragon: Dragon }
  | { readonly kind: "flower"; readonly flower: Flower }
  | { readonly kind: "season"; readonly season: Season };

export const SUITS: readonly Suit[] = ["circles", "bamboo", "characters"];
export const SUIT_RANKS: readonly SuitRank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const WINDS: readonly Wind[] = ["east", "south", "west", "north"];
export const DRAGONS: readonly Dragon[] = ["red", "green", "white"];
export const FLOWERS: readonly Flower[] = ["plum", "orchid", "chrysanthemum", "bamboo"];
export const SEASONS: readonly Season[] = ["spring", "summer", "autumn", "winter"];

/** The 34 faces the wall carries four copies of: 27 suit tiles, 4 winds, 3 dragons. */
export const FACES: readonly Tile[] = [
  ...SUITS.flatMap((suit) => SUIT_RANKS.map((rank): Tile => ({ kind: "suit", suit, rank }))),
  ...WINDS.map((wind): Tile => ({ kind: "wind", wind })),
  ...DRAGONS.map((dragon): Tile => ({ kind: "dragon", dragon })),
];

/** The 8 bonus tiles, ONE copy each. */
export const BONUS_TILES: readonly Tile[] = [
  ...FLOWERS.map((flower): Tile => ({ kind: "flower", flower })),
  ...SEASONS.map((season): Tile => ({ kind: "season", season })),
];

/** The full 144-tile wall. */
export const ALL_TILES: readonly Tile[] = [
  ...FACES.flatMap((face) => [face, face, face, face]),
  ...BONUS_TILES,
];

/** A face's name. 42 distinct values exist; `tileId` is the only producer. */
export type TileId = string;

/**
 * The face's own name — 42 distinct values across the wall, one per piece of
 * artwork. Two tiles with the same `tileId` are the same face; they are not
 * necessarily interchangeable in a deal, which is what `matchKey` is for.
 */
export function tileId(tile: Tile): TileId {
  switch (tile.kind) {
    case "suit":
      return `${tile.rank}-${tile.suit}`;
    case "wind":
      return `wind-${tile.wind}`;
    case "dragon":
      return `dragon-${tile.dragon}`;
    case "flower":
      return `flower-${tile.flower}`;
    case "season":
      return `season-${tile.season}`;
  }
}

export type MatchKey = string;

/**
 * Two tiles may be removed together exactly when their match keys are equal.
 *
 * For the 34 ordinary faces that is identity: a five of circles pairs only
 * with another five of circles. The 8 bonus tiles are the exception and the
 * whole reason this function is not `tileId` — any flower pairs with any other
 * flower, any season with any other season, and a flower NEVER pairs with a
 * season. Two groups, not one: collapsing them onto a single "bonus" key
 * still satisfies both positive cases and is exactly the implementation
 * `tile.test.ts`'s flower-vs-season case exists to reject.
 */
export function matchKey(tile: Tile): MatchKey {
  switch (tile.kind) {
    case "flower":
      return "flower";
    case "season":
      return "season";
    default:
      return tileId(tile);
  }
}
