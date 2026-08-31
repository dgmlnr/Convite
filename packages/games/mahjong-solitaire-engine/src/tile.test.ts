import { describe, expect, it } from "vitest";

import { ALL_TILES, BONUS_TILES, FACES, matchKey, tileId } from "./tile.js";

describe("tile identity", () => {
  it("has 34 faces that the wall carries four copies of: 27 suit tiles, 4 winds, 3 dragons", () => {
    expect(FACES).toHaveLength(34);
    expect(FACES.filter((tile) => tile.kind === "suit")).toHaveLength(27);
    expect(FACES.filter((tile) => tile.kind === "wind")).toHaveLength(4);
    expect(FACES.filter((tile) => tile.kind === "dragon")).toHaveLength(3);
  });

  it("has 8 bonus tiles the wall carries ONE copy of each: 4 flowers, 4 seasons", () => {
    expect(BONUS_TILES).toHaveLength(8);
    expect(BONUS_TILES.filter((tile) => tile.kind === "flower")).toHaveLength(4);
    expect(BONUS_TILES.filter((tile) => tile.kind === "season")).toHaveLength(4);
  });

  it("builds a wall of 144: four copies of each of the 34 faces, plus one of each of the 8 bonus tiles", () => {
    expect(ALL_TILES).toHaveLength(144);

    const copies = new Map<string, number>();
    for (const tile of ALL_TILES) copies.set(tileId(tile), (copies.get(tileId(tile)) ?? 0) + 1);

    // 42 distinct faces on the wall, which is also the count of art files the
    // tile package will ship (design D5). Asserted before the two loops below
    // so neither can prove nothing by iterating an empty map.
    expect(copies.size).toBe(42);
    expect(FACES.map((face) => copies.get(tileId(face)))).toEqual(Array<number>(34).fill(4));
    expect(BONUS_TILES.map((bonus) => copies.get(tileId(bonus)))).toEqual(Array<number>(8).fill(1));
  });

  it("gives every distinct face its own id", () => {
    expect(tileId({ kind: "suit", suit: "circles", rank: 5 })).toBe("5-circles");
    expect(tileId({ kind: "suit", suit: "bamboo", rank: 5 })).toBe("5-bamboo");
    expect(tileId({ kind: "wind", wind: "east" })).toBe("wind-east");
    expect(tileId({ kind: "dragon", dragon: "red" })).toBe("dragon-red");
    expect(tileId({ kind: "flower", flower: "bamboo" })).toBe("flower-bamboo");
    expect(tileId({ kind: "season", season: "spring" })).toBe("season-spring");
  });
});

describe("matchKey", () => {
  // The rule, from the domain source the launch brief fetched verbatim
  // (Tom Sloper's mahjong FAQ, entry 13): all flowers match one another, all
  // seasons match one another, and a flower does NOT match a season. The same
  // source also says "there are four identical copies of each tile type" —
  // which is FALSE for the eight bonus tiles and is why the wall test above
  // asserts 4 copies for the 34 faces and 1 for the 8 bonus tiles separately.
  // Take the matching sentence from that page, not the count sentence.
  it("matches any two distinct flowers", () => {
    expect(matchKey({ kind: "flower", flower: "plum" })).toBe(matchKey({ kind: "flower", flower: "orchid" }));
  });

  it("matches any two distinct seasons", () => {
    expect(matchKey({ kind: "season", season: "spring" })).toBe(matchKey({ kind: "season", season: "winter" }));
  });

  // THE case. The two above pass under an implementation that collapses all
  // eight bonus tiles onto one key, so alone they prove nothing about the
  // bonus relation — only this one separates the two groups.
  it("does NOT match a flower with a season", () => {
    expect(matchKey({ kind: "flower", flower: "plum" })).not.toBe(matchKey({ kind: "season", season: "spring" }));
  });

  it("matches an ordinary face only with its own copies", () => {
    const fiveOfCircles = { kind: "suit", suit: "circles", rank: 5 } as const;
    expect(matchKey(fiveOfCircles)).toBe(matchKey({ kind: "suit", suit: "circles", rank: 5 }));
    expect(matchKey(fiveOfCircles)).not.toBe(matchKey({ kind: "suit", suit: "bamboo", rank: 5 }));
    expect(matchKey({ kind: "wind", wind: "east" })).not.toBe(matchKey({ kind: "wind", wind: "south" }));
    expect(matchKey({ kind: "dragon", dragon: "red" })).not.toBe(matchKey({ kind: "dragon", dragon: "green" }));
  });

  it("partitions the whole wall into 72 pairs — every key holds an EVEN number of tiles", () => {
    const byKey = new Map<string, number>();
    for (const tile of ALL_TILES) byKey.set(matchKey(tile), (byKey.get(matchKey(tile)) ?? 0) + 1);

    // Size first: a `for` over an empty map asserts nothing (archive §5 trap 6).
    expect(byKey.size).toBeGreaterThan(0);
    for (const [key, count] of byKey) {
      expect(count % 2, `match key ${key} holds ${count} tiles, so the wall cannot be drawn as pairs`).toBe(0);
    }
    expect([...byKey.values()].reduce((sum, count) => sum + count, 0) / 2).toBe(72);
  });
});
