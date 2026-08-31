/**
 * The mahjong tile SET as artwork, with no game in it.
 *
 * NAMED AFTER THE TILES, NOT AFTER A ROLE. A dominoes game would get its own
 * `domino-tile-ui`; a shared `tile-ui` would be a package with no domain —
 * the same objection that keeps `spanish-deck-ui` from being `deck-ui`, and
 * the same one that killed the idea of a shared mahjong engine. What is here
 * is what any mahjong game needs to DRAW a tile: the 42 face identities, the
 * artwork that goes with them, the body they sit on, and the credit their
 * license requires.
 *
 * L0, by rule as well as by intention (`l0-mahjong-tile-ui-no-workspace-deps`
 * in `.dependency-cruiser.cjs`): it imports no workspace package at all, so
 * it cannot learn what a legal move is, and a game cannot smuggle a rule in
 * through the art.
 */
export type { TileAttribution } from "./about.js";
export { TILE_ART_SOURCES, TILE_ATTRIBUTION, commonsFilePage } from "./about.js";
export type { Dragon, Flower, Season, Suit, SuitRank, Tile, TileId, Wind } from "./tile.js";
export { DRAGONS, FLOWERS, SEASONS, SUITS, SUIT_RANKS, WINDS, tileId } from "./tile.js";
export { ALL_TILE_FACES, TILE_FRONT_FILENAMES } from "./tiles.js";
