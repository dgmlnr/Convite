import { describe, expect, it } from "vitest";
import { CATEGORY_IDS, getViewFor } from "@hexdev/generala-engine";
import type { CategoryId, DieFace, MatchState } from "@hexdev/generala-engine";
import { ALICE, BOB, driveTo, turnShowing } from "./fixtures.js";
import { SACRIFICE_ORDER, immediateValue, largestMatchingGroup, sacrificeRank } from "./heuristics.js";

/**
 * WHAT THIS FILE CAN SAY THAT A TIER'S TESTS CANNOT, which is the only reason
 * it exists beside them.
 *
 * A tier is asked one question and answers with one action, so everything about
 * it is observed through that action. Two of the three things here are never
 * observable that way:
 *
 * - `largestMatchingGroup` returns a FACE as well as positions, and no offer
 *   list carries a face — a hold is indices (`legal-actions.ts`).
 * - `immediateValue` is asked at `rollsUsed === 1` here, which is where the
 *   servida bonus lives (ruleset §Sección inferior, +5). The greedy tier never
 *   scores on the opening throw, so its own tests structurally cannot reach that
 *   arm — and slice 17's exact one-ply EV will, at every leaf it evaluates.
 *
 * So these are not the tier's assertions restated one layer down. Slice 8
 * measured what that costs and deleted three such duplicates from
 * `hidden-state.test.ts`: a fence a pre-existing test already catches is not
 * coverage, it is a second place to fix the same thing.
 */

/** The dice on the table at this position, which is where every value below is read from. */
function diceAt(state: MatchState): readonly DieFace[] {
  const turn = state.turn;
  if (turn.phase !== "deciding") throw new Error(`the fixture stopped in ${turn.phase}, where there are no dice to reason about`);
  return turn.dice;
}

/** `largestMatchingGroup` over a position the engine really produced, never over a literal. */
function groupAt(state: MatchState): { face: DieFace; indices: readonly number[] } {
  const turn = state.turn;
  if (turn.phase !== "deciding") throw new Error(`the fixture stopped in ${turn.phase}`);
  return largestMatchingGroup(turn.dice);
}

describe("largestMatchingGroup names a face and the positions showing it (D7's hold rule)", () => {
  it("three of a kind beats a higher single die", () => {
    expect(groupAt(driveTo(turnShowing([6, 2, 2, 2, 1])))).toEqual({ face: 2, indices: [1, 2, 3] });
  });

  it("the positions need not be neighbours", () => {
    expect(groupAt(driveTo(turnShowing([3, 6, 3, 6, 3])))).toEqual({ face: 3, indices: [0, 2, 4] });
  });

  it("two groups of equal size go to the higher face", () => {
    expect(groupAt(driveTo(turnShowing([2, 2, 5, 5, 1])))).toEqual({ face: 5, indices: [2, 3] });
  });

  /**
   * THE CASE ABOVE IS NOT ENOUGH ON ITS OWN, and a mutation is what said so.
   *
   * In `[2,2,5,5,1]` the higher face also happens to sit LATER in the row, so
   * "the higher face wins" and "the last equal face wins" give the same answer.
   * Relaxing the comparison to a bare `>=` — which is exactly the slip the
   * implementation's own comment warns about — left the entire suite green.
   * Here the 5s come first, and the two rules disagree.
   */
  it("the higher face wins the tie even when it is sitting first in the row", () => {
    expect(groupAt(driveTo(turnShowing([5, 5, 2, 2, 1])))).toEqual({ face: 5, indices: [0, 1] });
  });

  it("the tie rule still decides when every group is a single die", () => {
    expect(groupAt(driveTo(turnShowing([1, 2, 3, 4, 6])))).toEqual({ face: 6, indices: [4] });
  });

  /** The same blind spot at the degenerate end: five groups of one, in descending order. */
  it("and it still decides when the dice descend, so the highest is the earliest", () => {
    expect(groupAt(driveTo(turnShowing([6, 4, 3, 2, 1])))).toEqual({ face: 6, indices: [0] });
  });

  it("five of a kind is one group of five, which is the shape no hold can express", () => {
    // 31 holds, never 32 (`legal-actions.ts`): keeping all five re-rolls
    // nothing. This is the answer the tier reads to know it must score instead.
    expect(groupAt(driveTo(turnShowing([5, 5, 5, 5, 5])))).toEqual({ face: 5, indices: [0, 1, 2, 3, 4] });
  });

  it("the indices always come out strictly ascending, over every position one match reaches", () => {
    // The `keep` order `sameAction` (`match-room.ts:220-232`) compares by index.
    // A group returned as `[1,0]` would be findable in no offer list at all.
    for (const faces of [
      [6, 2, 2, 2, 1],
      [3, 6, 3, 6, 3],
      [2, 2, 5, 5, 1],
      [1, 2, 3, 4, 6],
      [4, 4, 4, 4, 2],
      [5, 5, 5, 5, 5],
    ] satisfies readonly (readonly DieFace[])[]) {
      const { indices } = groupAt(driveTo(turnShowing(faces)));
      expect(indices).toEqual([...indices].sort((left, right) => left - right));
      expect(new Set(indices).size).toBe(indices.length);
    }
  });
});

/**
 * design §D7: "when everything yields 0, cross by a fixed `SACRIFICE_ORDER`
 * constant."
 *
 * The constant is hand-picked and `heuristics.ts` says so, so what is asserted
 * here is what a hand-picked constant can still get structurally wrong: a box
 * missing, a box named twice, or a rank that does not answer.
 */
describe("SACRIFICE_ORDER is a complete ladder over the eleven boxes", () => {
  it("names every box on the card, exactly once", () => {
    expect([...SACRIFICE_ORDER].sort()).toEqual([...CATEGORY_IDS].sort());
    expect(SACRIFICE_ORDER.length).toBe(CATEGORY_IDS.length);
  });

  it("ranks every box, and the ranks are the positions", () => {
    expect(CATEGORY_IDS.map(sacrificeRank).sort((left, right) => left - right)).toEqual(CATEGORY_IDS.map((_, index) => index));
  });

  it("the doble is the cheapest box and sixes the dearest — the two rungs that are certain", () => {
    // The doble needs five of a kind AND a generala box written above zero
    // (ruleset §La precondición de la doble), so it is strictly rarer than the
    // box it depends on; sixes is the highest-paying box in the upper section.
    expect(SACRIFICE_ORDER[0]).toBe("generala-doble");
    expect(SACRIFICE_ORDER[SACRIFICE_ORDER.length - 1]).toBe("sixes");
  });

  it("a box the ladder never named sorts last rather than taking the tier down", () => {
    // A twelfth category added to `CategoryId` and forgotten here becomes the
    // box the bot protects hardest, which is the safe direction to fail in.
    expect(sacrificeRank("not-a-box" as CategoryId)).toBe(SACRIFICE_ORDER.length);
  });
});

/**
 * `immediateValue` is a pass-through to the engine's `scoreFor`, and these
 * cases are about it STAYING one.
 *
 * The servida arm is the half no tier's own tests can reach today: the greedy
 * tier holds while throws remain, so it never writes a box on the opening
 * throw. It is asserted here because slice 17's exact enumeration evaluates
 * every leaf at whatever `rollsUsed` it is standing on, and a bonus this
 * function dropped would be a silent five points per juego mayor.
 */
describe("immediateValue asks the engine, so the ruleset arrives with the answer", () => {
  /** The opening throw of a turn: `rollsUsed === 1`, which is what servida means. */
  function openingThrowOf(faces: readonly DieFace[]): MatchState {
    return driveTo([{ throw: faces }]);
  }

  it("a juego mayor made on the opening throw carries the servida bonus", () => {
    const state = openingThrowOf([1, 2, 3, 4, 5]);
    expect(diceAt(state)).toEqual([1, 2, 3, 4, 5]);
    expect(immediateValue(getViewFor(state, ALICE), "escalera")).toBe(25);
  });

  it("the same combination remade later is armada, and the difference is exactly the bonus", () => {
    // Made, broken, remade — ruleset §servida is the counter at scoring time and
    // never a memory of what the dice once showed.
    const state = driveTo([{ throw: [1, 2, 3, 4, 5] }, { hold: [] }, { throw: [1, 2, 3, 4, 5] }]);
    expect(diceAt(state)).toEqual([1, 2, 3, 4, 5]);
    expect(immediateValue(getViewFor(state, ALICE), "escalera")).toBe(20);
  });

  it("the upper section takes no bonus, servida or not", () => {
    // ruleset §Sección superior: "Sin bonus." The +5 rides the juegos mayores.
    expect(immediateValue(getViewFor(openingThrowOf([6, 6, 6, 2, 1]), ALICE), "sixes")).toBe(18);
  });

  it("an open box worth nothing is worth nothing, not undefined", () => {
    // Every open category is a legal target evaluating to whatever it yields,
    // zero included — which is what makes crossing out fall out of the rules
    // rather than needing an action type (ruleset §Generalización de scoring).
    expect(immediateValue(getViewFor(openingThrowOf([1, 1, 2, 3, 4]), ALICE), "escalera")).toBe(0);
  });

  it("it values the box for the seat being asked, not for seat 0", () => {
    // `view.cards[view.self.seat]`, not `view.cards[0]`. The doble's
    // precondition is read off a card, so a bot valuing boxes against the wrong
    // seat's card would unlock the 100 for the wrong player.
    // Seat 0 writes a real generala; seat 1 then throws the same five equal
    // faces with its own generala box still open. One table, one set of dice,
    // two cards — so the only thing that can move the answer is whose card is
    // read. Both turns come through `turnShowing` because five of a kind on an
    // OPENING throw ends the match outright (ruleset §Generala servida).
    const state = driveTo([...turnShowing([6, 6, 6, 6, 6]), { score: "generala" }, ...turnShowing([5, 5, 5, 5, 5])]);
    expect(diceAt(state)).toEqual([5, 5, 5, 5, 5]);
    expect(state.cards[0]!.generala).toBe(50);
    expect(state.cards[1]!.generala).toBeNull();
    expect(immediateValue(getViewFor(state, BOB), "generala-doble")).toBe(0);
    expect(immediateValue(getViewFor(state, ALICE), "generala-doble")).toBe(100);
  });
});
