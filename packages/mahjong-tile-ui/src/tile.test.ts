import { describe, expect, it } from "vitest";
import { DRAGONS, FLOWERS, SEASONS, SUITS, SUIT_RANKS, WINDS, tileId } from "./tile.js";

/**
 * The id is what names a file on disk and what a route accepts, so its shape
 * is a contract with two things this package cannot see: the engine that
 * produces tiles, and the checked-in artwork. Both halves are fenced — the
 * shape by example here, the artwork by `tiles.test.ts` reading the real
 * directory.
 */
describe("tile: tileId names one piece of artwork", () => {
  it("writes a suit tile as rank-then-suit, the shape the engine documents", () => {
    expect(tileId({ kind: "suit", suit: "circles", rank: 5 })).toBe("5-circles");
    expect(tileId({ kind: "suit", suit: "characters", rank: 9 })).toBe("9-characters");
  });

  it("prefixes the honours by their kind, so a wind and a dragon can never collide", () => {
    expect(tileId({ kind: "wind", wind: "east" })).toBe("wind-east");
    expect(tileId({ kind: "dragon", dragon: "red" })).toBe("dragon-red");
  });

  /**
   * The one collision the prefixes actually prevent, and it is not
   * hypothetical: 條 (the bamboo SUIT) and 竹 (the bamboo FLOWER) are two
   * different drawings that would otherwise share the id `1-bamboo` /
   * `bamboo`, and one of them would quietly render as the other.
   */
  it("keeps the bamboo suit and the bamboo flower apart", () => {
    expect(tileId({ kind: "suit", suit: "bamboo", rank: 1 })).toBe("1-bamboo");
    expect(tileId({ kind: "flower", flower: "bamboo" })).toBe("flower-bamboo");
    expect(tileId({ kind: "suit", suit: "bamboo", rank: 1 })).not.toBe(tileId({ kind: "flower", flower: "bamboo" }));
  });

  it("keeps a flower and a season apart even though both are bonus tiles", () => {
    expect(tileId({ kind: "flower", flower: "plum" })).toBe("flower-plum");
    expect(tileId({ kind: "season", season: "spring" })).toBe("season-spring");
  });
});

/**
 * The value lists are what `ALL_TILE_FACES` is built from, so a missing or
 * duplicated entry there is a missing or duplicated piece of artwork. Sized
 * against nothing but themselves: the count that matters (42) is asserted
 * once, in `tiles.test.ts`, against the collection it actually describes.
 */
describe("tile: the value lists are complete and hold no duplicates", () => {
  it("lists three suits, nine ranks, four winds and three dragons", () => {
    expect(SUITS).toEqual(["circles", "bamboo", "characters"]);
    expect(SUIT_RANKS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(WINDS).toEqual(["east", "south", "west", "north"]);
    expect(DRAGONS).toEqual(["red", "green", "white"]);
  });

  it("lists the four flowers and the four seasons as disjoint sets", () => {
    expect(FLOWERS).toEqual(["plum", "orchid", "chrysanthemum", "bamboo"]);
    expect(SEASONS).toEqual(["spring", "summer", "autumn", "winter"]);
    expect(FLOWERS.filter((flower) => (SEASONS as readonly string[]).includes(flower))).toEqual([]);
  });
});
