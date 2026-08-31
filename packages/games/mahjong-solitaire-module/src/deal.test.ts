import { describe, expect, it } from "vitest";
import { ALL_TILES, LAYOUT, isFree, matchKey, tileId } from "@hexdev/mahjong-solitaire-engine";
import type { MatchKey, TileId } from "@hexdev/mahjong-solitaire-engine";
import type { RandomSource } from "@hexdev/platform-contract";
import { SYSTEM_ACTOR_ID, chooseFreePosition, dealBoard, generateDeal } from "./deal.js";

/** A tiny LCG, so a "random" source in a test is still a fixed sequence. */
function seeded(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** The instrument the entropy budget is measured with: it forwards every draw
 * and counts it. */
function counting(source: RandomSource): { readonly rng: RandomSource; readonly calls: () => number } {
  let calls = 0;
  return {
    rng: () => {
      calls += 1;
      return source();
    },
    calls: () => calls,
  };
}

const KEY_BY_ID: ReadonlyMap<TileId, MatchKey> = new Map(ALL_TILES.map((tile) => [tileId(tile), matchKey(tile)]));
const FLOWER_IDS: readonly TileId[] = ALL_TILES.filter((tile) => matchKey(tile) === "flower").map(tileId);

// Derived from the engine's own layout and from the algorithm's two entropy
// consumers, never from a constant this package exports: one draw per position
// placed (144), plus one Fisher-Yates step per pair key after the first (71).
const PAIR_COUNT = LAYOUT.length / 2;
const EXPECTED_DRAWS = LAYOUT.length + (PAIR_COUNT - 1);

describe("the deal's entropy budget", () => {
  /**
   * THIS IS THE NO-SEARCH FENCE, and it is the only one that isolates.
   *
   * The proposal wanted an eslint rule banning recursion and backtracking;
   * `no-restricted-syntax` is AST-SELECTOR based and structurally cannot see
   * that a function calls itself, so design X-2 replaced it with this. A deal
   * draws a CONSTANT number of random values, fixed by the algorithm and
   * independent of the board and of the seed. A retry-until-solvable loop, a
   * reshuffle-on-reject filter, or a backtracking search cannot hold that
   * constant: each rejected attempt spends more entropy.
   */
  it("draws exactly one value per position placed plus one per shuffle step, whatever the seed", () => {
    const first = counting(seeded(1));
    dealBoard(first.rng);
    const second = counting(seeded(99));
    dealBoard(second.rng);

    expect(first.calls()).toBe(EXPECTED_DRAWS);
    expect(second.calls()).toBe(EXPECTED_DRAWS);
  });

  /**
   * The budget is a constant only because the choice is always DRAWN, even
   * where it is forced. Skipping the draw for a one-element list would make
   * the total a property of the layout's shape instead of the algorithm's.
   */
  it("chooseFreePosition draws exactly one value, even when the list leaves nothing to choose", () => {
    const forced = counting(seeded(3));
    expect(chooseFreePosition([17], forced.rng)).toBe(17);
    expect(forced.calls()).toBe(1);

    const open = counting(seeded(3));
    expect([4, 9, 12]).toContain(chooseFreePosition([4, 9, 12], open.rng));
    expect(open.calls()).toBe(1);
  });

  /**
   * COUNTING THE DRAWS IS NOT ENOUGH, and this fence exists because measuring
   * found that out. A policy that draws exactly the right number of values and
   * then always takes the first free position satisfies every other test in
   * this file: the budget is right, the deal is still deterministic, and two
   * seeds still differ because the pair-key shuffle differs. Difficulty would
   * be a no-op and nothing would say so. So the drawn value has to be seen
   * DECIDING, across the whole list.
   */
  it("lets the drawn value decide which free position comes back", () => {
    expect(chooseFreePosition([4, 9, 12], () => 0)).toBe(4);
    expect(chooseFreePosition([4, 9, 12], () => 0.5)).toBe(9);
    expect(chooseFreePosition([4, 9, 12], () => 0.99)).toBe(12);
  });
});

describe("the deal", () => {
  it("deals the same board twice from the same random source", () => {
    expect(dealBoard(seeded(42)).placements).toEqual(dealBoard(seeded(42)).placements);
  });

  it("deals different boards from different random sources", () => {
    expect(dealBoard(seeded(42)).placements).not.toEqual(dealBoard(seeded(43)).placements);
  });

  it("places every tile of the wall exactly once", () => {
    const dealt = [...dealBoard(seeded(5)).placements].sort();
    expect(dealt).toEqual([...ALL_TILES.map(tileId)].sort());
  });

  /**
   * THE BONUS TILES ARE WHY PAIRS ARE DRAWN BY MATCH KEY AND NOT BY IDENTITY.
   * The wall holds ONE of each of the eight bonus tiles, so a generator that
   * pops two equal ids can never pair them. All four flowers share one key, so
   * the two flower pairs each hold two DIFFERENT faces — which is exactly what
   * an identity-popping implementation cannot produce.
   */
  it("pairs the four flowers with each other, two faces that are not the same face", () => {
    const { placements, solution } = generateDeal(seeded(11));
    const flowerPairs = solution.filter((step) => FLOWER_IDS.includes(placements[step.a]));

    expect(flowerPairs).toHaveLength(FLOWER_IDS.length / 2);
    for (const step of flowerPairs) {
      expect(FLOWER_IDS).toContain(placements[step.b]);
      expect(placements[step.a]).not.toBe(placements[step.b]);
    }
    expect(new Set(flowerPairs.flatMap((step) => [placements[step.a], placements[step.b]]))).toEqual(new Set(FLOWER_IDS));
  });

  /**
   * SOLVABILITY IS REPLAYED, NEVER SEARCHED. This consults the recorded order
   * and nothing else: no alternative is ever explored, no move is ever undone.
   * Deciding whether an arbitrary board is solvable is NP-complete; generating
   * it backwards sidesteps the question instead of answering it.
   */
  it("the recorded solution really does solve the board the deal produced", () => {
    const { placements, solution } = generateDeal(seeded(7));
    expect(solution).toHaveLength(PAIR_COUNT);

    const onBoard = new Set<number>(placements.map((_, index) => index));
    for (const step of solution) {
      expect(onBoard.has(step.a)).toBe(true);
      expect(onBoard.has(step.b)).toBe(true);
      expect(isFree(step.a, onBoard)).toBe(true);
      expect(isFree(step.b, onBoard)).toBe(true);
      expect(step.a).toBeLessThan(step.b);
      expect(KEY_BY_ID.get(placements[step.a])).toBe(KEY_BY_ID.get(placements[step.b]));
      onBoard.delete(step.a);
      onBoard.delete(step.b);
    }
    expect(onBoard.size).toBe(0);
  });

  /**
   * THE SOLUTION NEVER LEAVES THE GENERATOR. The placement order is what
   * proves the board solvable; the action carries the finished placement and
   * nothing else, so no view and no serialized state can leak it.
   */
  it("ships the finished placement as data, and nothing about how it was found", () => {
    const action = dealBoard(seeded(2));
    expect(Object.keys(action).sort()).toEqual(["placements", "playerId", "type"]);
    expect(action.type).toBe("deal-board");
    expect(action.playerId).toBe(SYSTEM_ACTOR_ID);
  });

  /**
   * The one step of the algorithm with no proof behind it: when the top layer
   * is down to a single tile its partner has to come from below, and that a
   * free one always exists there is measured here rather than argued. Sixty
   * boards, every step of each.
   */
  it("finds a free pair at every step, on sixty different boards", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      expect(() => generateDeal(seeded(seed))).not.toThrow();
    }
  });
});
