import { describe, expect, it } from "vitest";
import { DIE_FACES } from "@hexdev/mentiroso-engine";
import type { PlayerView } from "@hexdev/mentiroso-engine";
import { counting, fixedRng, RIVAL_A, RIVAL_B, RIVAL_C, scriptedRng, SELF } from "./fixtures.js";
import { determinizeRivalDice, drawDie } from "./determinize.js";

/**
 * SDD `mentiroso`, work unit D4/task 4.4, design D7: "`hard` determinizes,
 * and truco's shared pool does NOT carry over ... dice are drawn WITH
 * REPLACEMENT and two rivals may both hold a 5 ... The reuse is the SHAPE
 * only — `view.rivals.map((rival) => draw(rival.diceCount, rng))`, one
 * `rng()` call per hidden die, no exhaustion case, no `splice`."
 *
 * `truco-bot/src/determinize.ts`'s own `dealFrom` splices a SHARED, FINITE
 * pool because cards are exclusive (once dealt, gone). Dice are not: the
 * game already allows two rivals to roll the same face (mentiroso-rules'
 * own showdown tally counts every die on the table toward one face). A
 * disjoint-pool reimplementation would silently FORBID that and bias every
 * downstream estimate — the negative control below proves this file does
 * not do that.
 */

function view(rivals: PlayerView["rivals"]): PlayerView {
  return {
    self: { playerId: SELF, seat: 0, dice: [] },
    rivals,
    phase: { kind: "bidding", turnSeat: 0, bid: null },
  };
}

describe("drawDie -- one uniform face over DIE_FACES, [0, 1) per RandomSource's own contract", () => {
  it("returns the lowest face at the bottom of the range", () => {
    expect(drawDie(fixedRng(0))).toBe(DIE_FACES[0]);
  });

  it("returns the highest face just under the top of the range", () => {
    expect(drawDie(fixedRng(0.999999))).toBe(DIE_FACES[DIE_FACES.length - 1]);
  });

  it("covers every one of the six equal-width sub-intervals, not only the two extremes", () => {
    // Triangulates the fake-it "always return the first/last face": a value
    // strictly inside each of the six `[i/6, (i+1)/6)` bands must map to
    // exactly that band's face.
    for (let index = 0; index < DIE_FACES.length; index += 1) {
      const midpoint = (index + 0.5) / DIE_FACES.length;
      expect(drawDie(fixedRng(midpoint))).toBe(DIE_FACES[index]);
    }
  });
});

describe("determinizeRivalDice -- with replacement (design D7's own trap)", () => {
  it("two DIFFERENT rivals may draw the IDENTICAL face -- impossible under a disjoint pool once its distinct values are exhausted", () => {
    // 3 rivals x 5 dice = 15 total hidden dice drawn from only 6 possible
    // faces. A `truco-bot`-style `dealFrom` splicing a 6-item shared pool
    // would run dry (or, worse, silently forbid repeats) long before 15
    // draws; with replacement, every single draw is free to repeat.
    const rivals: PlayerView["rivals"] = [
      { seat: 1, playerId: RIVAL_A, diceCount: 5 },
      { seat: 2, playerId: RIVAL_B, diceCount: 5 },
      { seat: 3, playerId: RIVAL_C, diceCount: 5 },
    ];
    const result = determinizeRivalDice(view(rivals), fixedRng(0));
    for (const rivalDice of result) {
      expect(rivalDice).toEqual([DIE_FACES[0], DIE_FACES[0], DIE_FACES[0], DIE_FACES[0], DIE_FACES[0]]);
    }
  });

  it("draws exactly one array PER rival, each exactly as long as that rival's own diceCount", () => {
    const rivals: PlayerView["rivals"] = [
      { seat: 1, playerId: RIVAL_A, diceCount: 2 },
      { seat: 2, playerId: RIVAL_B, diceCount: 0 }, // eliminated: zero dice, zero draws
      { seat: 3, playerId: RIVAL_C, diceCount: 3 },
    ];
    const result = determinizeRivalDice(view(rivals), fixedRng(0));
    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(2);
    expect(result[1]).toHaveLength(0);
    expect(result[2]).toHaveLength(3);
  });

  it("spends EXACTLY one rng() call per hidden die, never per rival and never a fixed constant", () => {
    const rivals: PlayerView["rivals"] = [
      { seat: 1, playerId: RIVAL_A, diceCount: 4 },
      { seat: 2, playerId: RIVAL_B, diceCount: 0 },
      { seat: 3, playerId: RIVAL_C, diceCount: 3 },
    ];
    const { rng, calls } = counting(fixedRng(0));
    determinizeRivalDice(view(rivals), rng);
    expect(calls()).toBe(7); // 4 + 0 + 3, never 3 (rival count) and never a table-wide constant
  });

  it("draws are genuinely INDEPENDENT per die, not one draw broadcast across the whole array", () => {
    // Triangulation: a scripted sequence hitting three DIFFERENT sub-bands
    // must produce three DIFFERENT faces for the SAME rival, in call order.
    const rivals: PlayerView["rivals"] = [{ seat: 1, playerId: RIVAL_A, diceCount: 3 }];
    const rng = scriptedRng([0, 0.999999, 0.5]);
    const result = determinizeRivalDice(view(rivals), rng);
    expect(result[0]).toEqual([DIE_FACES[0], DIE_FACES[DIE_FACES.length - 1], DIE_FACES[3]]);
  });
});
