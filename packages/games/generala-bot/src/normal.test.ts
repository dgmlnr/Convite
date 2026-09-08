import { describe, expect, it } from "vitest";
import { CATEGORY_IDS, getLegalActions, getViewFor, scoreFor } from "@hexdev/generala-engine";
import type { CategoryId, GeneralaAction, MatchState, PlayerId } from "@hexdev/generala-engine";
import { ALICE, driveTo, turnShowing } from "./fixtures.js";
import type { DriveStep } from "./fixtures.js";
import { SACRIFICE_ORDER } from "./heuristics.js";
import { createNormalBot } from "./normal.js";
import type { NonEmptyActions } from "./tier.js";

/** The room's own budget, `match-room.ts:162`. Normal never reads it; the port passes it. */
const ROOM_BUDGET_MS = 1000;

/**
 * The same narrowing `createBotStrategy`'s wrapper performs, done here because
 * these tests speak to the TIER directly rather than through the wrapper — that
 * is the point of them. The empty case is a fixture bug, so it throws with a
 * message about the fixture rather than about the bot.
 */
function offered(state: MatchState, playerId: PlayerId): NonEmptyActions {
  const legal = getLegalActions(state, playerId);
  if (legal.length === 0) throw new Error(`the fixture reached a position offering ${playerId} nothing, so there is no decision to assert about`);
  return legal as NonEmptyActions;
}

/**
 * What normal decides at this position, together with the list it decided from
 * — so every assertion below can check IDENTITY against the very objects the
 * engine offered rather than against a rebuilt lookalike.
 *
 * `sameAction` (`match-room.ts:220-232`) walks `keep` BY INDEX, so a hold this
 * bot reassembled as `[1,0]` is simply not the `[0,1]` the game offered and the
 * room would refuse it. `toBe` is the only assertion that can tell those apart;
 * slice 8 measured a copy passing `toEqual` while failing `toBe`.
 */
function decide(state: MatchState, playerId: PlayerId = ALICE): { chosen: GeneralaAction; legal: NonEmptyActions } {
  const legal = offered(state, playerId);
  const chosen = createNormalBot().chooseAction(getViewFor(state, playerId), legal, ROOM_BUDGET_MS);
  expect(legal).toContain(chosen);
  return { chosen, legal };
}

/** The `keep` normal set aside here, or `null` if it wrote a box instead. */
function heldIndices(state: MatchState, playerId: PlayerId = ALICE): readonly number[] | null {
  const { chosen } = decide(state, playerId);
  return chosen.type === "hold" ? chosen.keep : null;
}

/** The box normal wrote here, or `null` if it set dice aside instead. */
function scoredBox(state: MatchState, playerId: PlayerId = ALICE): CategoryId | null {
  const { chosen } = decide(state, playerId);
  return chosen.type === "score" ? chosen.category : null;
}

/**
 * Seat 1's whole turn, played out so the turn comes back round to seat 0.
 *
 * The box is an argument because a filled box never reopens: a script that
 * burned the same one twice would be refused by the reducer, and `driveTo`
 * turns that into a loud fixture failure rather than a quietly wrong position.
 */
function bobBurns(category: CategoryId): readonly DriveStep[] {
  return [{ throw: [1, 2, 3, 4, 6] }, { score: category }];
}

/**
 * design §D7, normal: "Greedy, no lookahead. Hold = largest matching group
 * (ties → higher face)."
 *
 * THE POLICY IS DELIBERATELY WEAK, and these cases pin the weakness rather than
 * apologise for it. Normal has no lookahead at all, so it cannot know that
 * breaking a made hand costs it anything — slice 17's exact one-ply EV is what
 * the design puts opposite that, and a normal tier that already played well
 * would leave hard with nothing to be better than.
 *
 * WHICH DICE MAKE THE LARGEST GROUP IS NOT ASSERTED HERE, and that is a measured
 * decision rather than an omission. `heuristics.test.ts` decides the group's own
 * rules — non-adjacent positions, equal sizes going to the higher face, the
 * degenerate case where every group is one die — and breaking the tie rule reds
 * those directly. Restating them through the tier added two more reds to the
 * same mutation and no new claim, which is exactly the duplication slice 8
 * measured and removed from `hidden-state.test.ts`: a fence a pre-existing test
 * already catches is not coverage, it is a second place to fix the same thing.
 * What is left is what only the TIER can say — that it consults the group at
 * all, where the hold/score boundary falls, and that it hands back the object it
 * was offered.
 */
describe("normal holds the LARGEST matching group, and a tie goes to the higher face (D7)", () => {
  it("three low dice beat one high one — this is a group policy, not a face policy", () => {
    // A "keep the highest die" bot would answer `[0]` here, and a "keep the
    // lowest" one `[4]`; only the group policy answers with the three 2s.
    expect(heldIndices(driveTo(turnShowing([6, 2, 2, 2, 1])))).toEqual([1, 2, 3]);
  });

  it("four of a kind keeps four and hands one die back", () => {
    expect(heldIndices(driveTo(turnShowing([4, 4, 4, 4, 2])))).toEqual([0, 1, 2, 3]);
  });

  it("the hold returned is the very object the engine offered, never one built to look like it", () => {
    const state = driveTo(turnShowing([6, 2, 2, 2, 1]));
    const { chosen, legal } = decide(state);
    expect(legal.some((action) => action === chosen)).toBe(true);
  });
});

/**
 * The other half of the arbitration, and it is forced by the rules rather than
 * chosen: a hold of all five dice re-rolls nothing, so the engine does not offer
 * it (`legal-actions.ts`: 31 holds, never 32). Five of a kind therefore has no
 * "largest group" to keep and the only move left is to write a box.
 */
describe("normal writes a box when no hold can improve the dice", () => {
  it("on the third throw there is no hold to make, so it scores", () => {
    // Keep the three 6s, hand two dice back, and get the same two faces again:
    // sixes 18, twos 2, ones 1, every other box nothing.
    expect(scoredBox(driveTo([...turnShowing([6, 6, 6, 2, 1]), { hold: [0, 1, 2] }, { throw: [2, 1] }]))).toBe("sixes");
  });

  it("five of a kind cannot be held, so it scores instead of stalling", () => {
    expect(scoredBox(driveTo(turnShowing([5, 5, 5, 5, 5])))).toBe("generala");
  });

  it("the highest immediate value wins, not the highest box on the printed card", () => {
    // full 30, fives 10, threes 9. A bot walking `CATEGORY_IDS` and taking the
    // first non-zero box answers `threes`.
    expect(scoredBox(driveTo([...turnShowing([3, 3, 3, 5, 5]), { hold: [0, 1, 2, 3] }, { throw: [5] }]))).toBe("full");
  });
});

/**
 * TOTAL EVEN AGAINST A LIST THE ENGINE WOULD NEVER BUILD, and `easy.ts` set the
 * precedent in this package with its own out-of-range source.
 *
 * `bestScore` answers `null` only for a `deciding` list carrying no score
 * action at all, which the engine's invariant makes unreachable — a seat only
 * reaches `deciding` with an open box, pinned in `legal-actions.ts`. The tier
 * is handed exactly that list here anyway, because "unreachable through the
 * engine" and "answers with a move if it ever happens" are different claims,
 * and it is the second one the room would suffer: it refuses an `undefined`
 * action and the table stalls with nobody able to read why off the wire.
 *
 * Deleting the fall-back reds nothing without this case — measured, which is
 * how it came to be written.
 */
describe("the tier is total, with no throw and no undefined on any path (D7's second layer)", () => {
  it("handed a list carrying no box at all, it still answers with one of the list's own members", () => {
    const state = driveTo(turnShowing([6, 2, 2, 2, 1]));
    // One hold, and deliberately NOT the one the largest group names, so the
    // lookup misses and there is no score to fall back to either.
    const strayHold = getLegalActions(state, ALICE).find((action) => action.type === "hold" && action.keep.join() === "0")!;
    const chosen = createNormalBot().chooseAction(getViewFor(state, ALICE), [strayHold], ROOM_BUDGET_MS);
    expect(chosen).toBe(strayHold);
  });
});

/**
 * design §D7, normal: "when everything yields 0, cross by a fixed
 * `SACRIFICE_ORDER` constant."
 *
 * ONE CONSTANT DOING ONE JOB. Crossing out is not a separate rule here — it is
 * what "the highest immediate value" degenerates into when every open box is
 * worth the same nothing, and a tie above zero is the same question asked with
 * a bigger number. So `SACRIFICE_ORDER` is the tie-break at every value rather
 * than a special case at zero, which is one ladder instead of two that could
 * disagree.
 */
describe("SACRIFICE_ORDER is the tie-break, and crossing out is just its zero case", () => {
  /**
   * THE DOBLE, ONES, TWOS AND THREES ARE WRITTEN FIRST FOR A MEASURED REASON,
   * and the first version of this case did not do it.
   *
   * That version left the doble open, and the ladder gives the doble up first —
   * but the doble is also the LAST box in `CATEGORY_IDS`. So "the ladder's
   * choice" and "whichever tied box the loop saw last" were the same answer,
   * and relaxing the comparison to a bare `>=` on the value left the suite
   * green. Writing those four boxes first moves the ladder's answer to
   * `escalera`, which is neither the first nor the last of what remains — the
   * only shape in which all three readings disagree, and it is asserted below
   * rather than left as a remark.
   *
   * `[1,1,2,2,3]` on the third throw with fours, fives, sixes, escalera, full,
   * póker and generala open pays nothing anywhere. That is asserted too: a
   * position where one box was still worth a point would be measuring the value
   * policy again instead of the ladder.
   */
  it("with every open box worth nothing it crosses the one the ladder names, which is neither the first nor the last on the card", () => {
    const state = driveTo([
      ...turnShowing([1, 1, 2, 2, 3]),
      { score: "generala-doble" },
      ...bobBurns("ones"),
      ...turnShowing([1, 1, 2, 2, 3]),
      { score: "ones" },
      ...bobBurns("twos"),
      ...turnShowing([1, 1, 2, 2, 3]),
      { score: "twos" },
      ...bobBurns("threes"),
      ...turnShowing([1, 1, 2, 2, 3]),
      { score: "threes" },
      ...bobBurns("fours"),
      ...turnShowing([1, 1, 2, 2, 3]),
      { hold: [0, 1, 2, 3] },
      { throw: [3] },
    ]);
    const turn = state.turn;
    expect(turn.phase).toBe("deciding");
    if (turn.phase !== "deciding") return;
    const card = state.cards[0]!;
    const open = CATEGORY_IDS.filter((category) => card[category] === null);
    expect(open.map((category) => scoreFor(category, turn.dice, turn.rollsUsed, card))).toEqual(open.map(() => 0));

    const byLadder = SACRIFICE_ORDER.find((category) => open.includes(category));
    // The three readings really are three different boxes here, so the
    // assertion below can only be satisfied by the ladder.
    expect(byLadder).toBe("escalera");
    expect(open[0]).toBe("fours");
    expect(open[open.length - 1]).toBe("generala");
    expect(scoredBox(state)).toBe(byLadder);
  });

  /**
   * The half a zero-only test cannot make: two boxes tied at THIRTY.
   *
   * Póker filled and generala crossed, then five 6s. `sixes` pays 30 and `full`
   * pays 30 (five of a kind contains 3+2, `scoring.ts:126`); the doble pays
   * nothing because the generala box was crossed. `sixes` comes BEFORE `full`
   * in `CATEGORY_IDS` and AFTER it in `SACRIFICE_ORDER`, so this is the case
   * where a tie-break on the printed order and a tie-break on the ladder give
   * different answers.
   */
  it("a tie above zero is broken by the same ladder, not by the printed card's order", () => {
    const state = driveTo([
      ...turnShowing([4, 4, 4, 4, 1]),
      { score: "poker" },
      ...bobBurns("ones"),
      ...turnShowing([1, 2, 3, 4, 6]),
      { score: "generala" },
      ...bobBurns("twos"),
      ...turnShowing([6, 6, 6, 6, 6]),
    ]);
    const turn = state.turn;
    expect(turn.phase).toBe("deciding");
    if (turn.phase !== "deciding") return;
    const card = state.cards[0]!;
    expect(scoreFor("sixes", turn.dice, turn.rollsUsed, card)).toBe(30);
    expect(scoreFor("full", turn.dice, turn.rollsUsed, card)).toBe(30);
    expect(scoreFor("generala-doble", turn.dice, turn.rollsUsed, card)).toBe(0);
    expect(CATEGORY_IDS.indexOf("sixes")).toBeLessThan(CATEGORY_IDS.indexOf("full"));
    expect(SACRIFICE_ORDER.indexOf("full")).toBeLessThan(SACRIFICE_ORDER.indexOf("sixes"));
    expect(scoredBox(state)).toBe("full");
  });
});
