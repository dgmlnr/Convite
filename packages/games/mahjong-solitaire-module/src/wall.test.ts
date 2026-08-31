import { describe, expect, it } from "vitest";
import { ALL_TILES, matchKey, tileId } from "@hexdev/mahjong-solitaire-engine";
import type { TileId } from "@hexdev/mahjong-solitaire-engine";
import { idsByMatchKey, pairKeys } from "./wall.js";

const ALL_IDS: readonly TileId[] = ALL_TILES.map(tileId);
const FLOWER_IDS: readonly TileId[] = ALL_TILES.filter((tile) => matchKey(tile) === "flower").map(tileId);
const SEASON_IDS: readonly TileId[] = ALL_TILES.filter((tile) => matchKey(tile) === "season").map(tileId);

describe("the wall, seen as pairs", () => {
  it("offers exactly one entry per pair the wall holds", () => {
    expect(pairKeys()).toHaveLength(ALL_TILES.length / 2);
  });

  /**
   * THE FENCE THE BONUS TILES EXIST FOR. Group the wall by tile id instead of
   * by match key and the 34 ordinary faces still pair perfectly — it is only
   * the eight bonus tiles, one copy each, that end up as groups of one and
   * vanish from this list.
   */
  it("turns the eight bonus tiles into two flower pairs and two season pairs", () => {
    const keys = pairKeys();
    expect(keys.filter((key) => key === "flower")).toHaveLength(FLOWER_IDS.length / 2);
    expect(keys.filter((key) => key === "season")).toHaveLength(SEASON_IDS.length / 2);
  });

  it("spends every face of the wall exactly once when each pair key is cashed in", () => {
    const pools = idsByMatchKey();
    const spent: TileId[] = [];
    for (const key of pairKeys()) {
      const pool = pools.get(key);
      expect(pool).toBeDefined();
      spent.push(pool!.pop()!, pool!.pop()!);
    }
    expect([...spent].sort()).toEqual([...ALL_IDS].sort());
    expect([...pools.values()].flat()).toEqual([]);
  });

  /**
   * The asymmetry that makes "pop two equal ids" wrong rather than merely
   * different: a flower pair is two faces that are NOT the same face, so no
   * amount of popping identical ids can ever produce one.
   */
  it("holds four different faces under the one flower key, and four under the one season key", () => {
    const pools = idsByMatchKey();
    expect(new Set(pools.get("flower"))).toEqual(new Set(FLOWER_IDS));
    expect(pools.get("flower")).toHaveLength(FLOWER_IDS.length);
    expect(new Set(pools.get("season"))).toEqual(new Set(SEASON_IDS));
    expect(pools.get("season")).toHaveLength(SEASON_IDS.length);
  });

  it("holds four copies of one face under an ordinary key", () => {
    expect(idsByMatchKey().get("5-circles")).toEqual(["5-circles", "5-circles", "5-circles", "5-circles"]);
  });
});
