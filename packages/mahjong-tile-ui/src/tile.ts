// Structurally identical to `mahjong-solitaire-engine`'s own `Tile` (same
// kinds, same suit/wind/dragon/flower/season names, same id format) by
// deliberate choice, NOT by importing it: this package is L0 and must not
// depend on any game package (dependency-cruiser rule
// `l0-mahjong-tile-ui-no-workspace-deps`). Any mahjong game's own `Tile`
// already satisfies this shape structurally, so no adapter is ever needed to
// call `getTileArt`. Same reasoning, same wording, as `spanish-deck-ui`'s
// `card.ts` — and as the engine's own `tile.ts` header, which says the art
// package will re-declare this shape rather than import it.
//
// AND THAT IS A RISK THIS PACKAGE OWNS, stated rather than glossed. Nothing
// mechanical keeps the two `tileId` implementations in step: the fence is a
// convention plus two test files that never see each other. What CAN be
// fenced here, and is, is that these 42 ids are exactly the 42 files
// `assets/tiles/` ships (`tiles.test.ts`), so a drift on either side shows up
// as artwork that resolves to nothing rather than as a silent mismatch.
//
// WHAT IS DELIBERATELY ABSENT: `matchKey`. Whether a flower may be removed
// with a season is a RULE, and rules live in the engine. This package draws
// faces; it has no opinion about which two of them make a pair.

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

/** A face's name. Exactly 42 distinct values exist; `tileId` is the only producer. */
export type TileId = string;

/**
 * The face's own name — one per piece of artwork, 42 in all.
 *
 * The prefixes are not decoration. `bamboo` is both a SUIT (條, the sticks)
 * and a FLOWER (竹), and they are two different drawings: without the
 * `flower-` prefix `1-bamboo` and the bamboo flower would be one id and one
 * of the two would silently take the other's art.
 */
export function tileId(tile: Tile): TileId {
  switch (tile.kind) {
    case "suit":
      return `${String(tile.rank)}-${tile.suit}`;
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
