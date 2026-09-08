import { describe, expect, it } from "vitest";
import { getLegalActions, getViewFor } from "@hexdev/generala-engine";
import type { DieFace, GeneralaAction, MatchState, PlayerView } from "@hexdev/generala-engine";
import { ALICE, driveTo, turnShowing } from "./fixtures.js";
import { createHardBot, expectedValueOfHold } from "./hard.js";
import { immediateValue } from "./heuristics.js";
import type { NonEmptyActions } from "./tier.js";

/** The room's own budget, `match-room.ts:162`. The port passes it; this tier finishes long before it. */
const ROOM_BUDGET_MS = 1000;

const hard = createHardBot();

/**
 * The view and the offer list for the seat whose turn it is, which is the only
 * seat this tier is ever asked about.
 *
 * The narrowing `createBotStrategy`'s wrapper performs, done here because these
 * tests speak to the TIER directly — that is the point of them. An empty list
 * is a fixture bug, so it throws about the fixture rather than about the bot,
 * exactly as `normal.test.ts` does.
 */
function asked(state: MatchState): { view: PlayerView; legal: NonEmptyActions } {
  const playerId = state.players[state.turn.seat]!;
  const legal = getLegalActions(state, playerId);
  if (legal.length === 0) throw new Error(`the fixture reached a position offering ${playerId} nothing, so there is no decision to assert about`);
  return { view: getViewFor(state, playerId), legal: legal as NonEmptyActions };
}

/**
 * What hard decides here, together with the list it decided from.
 *
 * ONE LIST, RETURNED WITH THE ANSWER, and that is not tidiness.
 * `getLegalActions` builds fresh objects on every call, so asking it twice and
 * comparing across the two lists compares equal-looking strangers — which is
 * what the first draft of this file did, and `toBe` caught it. Identity is the
 * claim being made (`sameAction` walks arrays by index, so a rebuilt hold is
 * unsubmittable however equal it looks), so it has to be identity against the
 * very list the tier was handed.
 */
function decide(state: MatchState): { chosen: GeneralaAction; legal: NonEmptyActions } {
  const { view, legal } = asked(state);
  const chosen = hard.chooseAction(view, legal, ROOM_BUDGET_MS);
  expect(legal).toContain(chosen);
  return { chosen, legal };
}

/**
 * FOUR SIXES AND A TWO, WHICH IS THE POSITION THIS FILE IS BUILT ON.
 *
 * Every number below can be checked by hand, and that is the point: an
 * expected value asserted against a second implementation of itself is not
 * asserted at all. Holding the four 6s re-rolls one die, so the leaf is
 * `[6,6,6,6,f]` for f = 1..6 — a generala worth 50 once, a póker worth 40 the
 * other five times.
 */
const FOUR_SIXES: readonly DieFace[] = [6, 6, 6, 6, 2];
const KEEP_THE_SIXES: readonly number[] = [0, 1, 2, 3];

/** Five dice with no run, no full, no póker and no generala: a hand that pays the lower section nothing. */
const NOTHING_HAND: readonly DieFace[] = [1, 1, 3, 4, 6];

describe("the expected value of a hold is the exact one-ply average, and it is hand-checkable", () => {
  it("keeping four 6s is worth 250/6 — one generala at 50 against five pókers at 40", () => {
    const { view } = asked(driveTo(turnShowing(FOUR_SIXES)));
    expect(expectedValueOfHold(view, KEEP_THE_SIXES)).toBeCloseTo(250 / 6, 10);
  });

  /**
   * The same hand one die further back, and it is where the WEIGHTS earn their
   * keep. Two dice are re-rolled, so the 36 ordered throws split 1 / 10 / 5 / 20
   * across five 6s, four 6s, a full and three 6s alone. A table that paid every
   * multiset the same weight would average those four values evenly and answer
   * 34.5 instead of 26.67.
   */
  it("keeping three 6s is worth 960/36, which only comes out right if the weights are multinomial", () => {
    const { view } = asked(driveTo(turnShowing(FOUR_SIXES)));
    expect(expectedValueOfHold(view, [0, 1, 2])).toBeCloseTo(960 / 36, 10);
  });

  /**
   * THE CARD IT READS IS THE CARD OF THE SEAT IT WAS ASKED ABOUT, and a
   * mutation is why this exists. Reading `view.cards[0]` instead of
   * `view.cards[view.self.seat]` left the whole suite green, because every
   * other fixture in this file is seat 0's turn — the classic shape where a
   * bug and a fixture agree by accident.
   *
   * Seat 0 crosses its generala box at zero first, so the two cards genuinely
   * differ: seat 1 can still score a generala for 50 and seat 0 cannot. Under
   * the wrong card the leaf tops out at the póker's 40 and this reads 40
   * instead of 41.67.
   *
   * It matters beyond arithmetic. `match-room.ts:315-318` builds ONE strategy
   * per room and reuses it for every seat, so a tier that answered for the
   * wrong card would play seat 1's turn with seat 0's scorecard all match.
   */
  it("asked about seat 1, it values the hold against SEAT 1's open boxes", () => {
    const state = driveTo([{ throw: NOTHING_HAND }, { score: "generala" }, { throw: [1, 2, 3, 4, 6] }, { hold: [] }, { throw: FOUR_SIXES }]);
    const { view } = asked(state);

    expect(view.self.seat).toBe(1);
    expect(view.cards[0]?.generala).toBe(0);
    expect(view.cards[1]?.generala).toBeNull();
    expect(expectedValueOfHold(view, KEEP_THE_SIXES)).toBeCloseTo(250 / 6, 10);
  });

  /**
   * ONE PLY IS ONE PLY, and these two numbers are what says so. A search that
   * looked two throws ahead would value the same holds HIGHER, because the leaf
   * would get to hold again instead of being made to write a box. 8.0 and 11.5
   * are the one-ply answers for the same five dice, and they differ from each
   * other for a reason worth reading: keeping `2,3,4,5` catches an escalera from
   * either end, and keeping `1,2,3,4` catches one only from the top.
   */
  it("a straight kept from both ends is worth 69/6 and from one end 48/6", () => {
    const { view } = asked(driveTo([{ throw: [1, 2, 3, 4, 5] }]));
    expect(expectedValueOfHold(view, [1, 2, 3, 4])).toBeCloseTo(69 / 6, 10);
    expect(expectedValueOfHold(view, [0, 1, 2, 3])).toBeCloseTo(48 / 6, 10);
  });
});

/**
 * THE WEAKNESS SLICE 16 PINNED, CLOSED HERE.
 *
 * `normal.ts` says it in its own docstring: with throws remaining it keeps the
 * largest matching group and re-rolls the rest, so it breaks an escalera
 * servida worth 25 to keep a single die, "because valuing a re-roll against a
 * made hand requires knowing what the re-roll is likely to produce". That is
 * the enumeration D7 reserves for this tier, and this is it collecting.
 */
describe("a made hand is worth more than the throw that would break it (D7)", () => {
  it("an escalera servida is written for 25 rather than broken to keep one die", () => {
    const { chosen, legal } = decide(driveTo([{ throw: [1, 2, 3, 4, 5] }]));

    expect(chosen).toEqual({ type: "score", playerId: ALICE, category: "escalera" });
    // The object the engine offered, never one this tier assembled. `sameAction`
    // (`match-room.ts:220-232`) walks arrays by index, so a rebuilt action is
    // unsubmittable however equal it looks — `toBe`, not `toEqual`.
    expect(chosen).toBe(legal.find((action) => action.type === "score" && action.category === "escalera"));
  });

  /**
   * The half that makes the case above a comparison rather than a coincidence.
   * The best hold on the table is worth 11.5 and the second-best 8.0; 25 beats
   * both, and it beats them by a margin no rounding could close.
   */
  it("and the hold it declined really was the best hold available", () => {
    const { view, legal } = asked(driveTo([{ throw: [1, 2, 3, 4, 5] }]));
    const holds = legal.filter((action) => action.type === "hold");
    expect(holds.length).toBe(31);
    const best = Math.max(...holds.map((action) => expectedValueOfHold(view, action.keep)));
    expect(best).toBeCloseTo(69 / 6, 10);
    expect(best).toBeLessThan(25);
  });
});

/**
 * THE SERVIDA BONUS, OBSERVED THROUGH A TIER FOR THE FIRST TIME IN THIS PACKAGE.
 *
 * Slice 16 measured that it could not be: the bonus lives at `rollsUsed === 1`
 * and a greedy tier always holds there, and there is no `rollsUsed === 1`
 * position with no hold on offer, because five of a kind on an opening throw is
 * a generala servida and ends the match. It pinned the bonus on
 * `immediateValue` directly and left the question of whether a lookahead tier
 * could reach it.
 *
 * IT CAN, AND THIS IS WHY. A hold always lands its leaf at `rollsUsed + 1`,
 * which is 2 at the earliest, so the bonus is on exactly one side of every
 * comparison this tier makes. Four 6s and a two is the hand where the five
 * points decide it: the póker is worth 45 servida and 40 armada, and the best
 * hold is worth 41.67 either way, so the SAME FIVE DICE with the SAME open
 * boxes are written on the first throw and re-rolled on the second.
 */
describe("the servida bonus changes the answer, and nothing else in the position does", () => {
  it("on the opening throw the póker is written for 45", () => {
    expect(decide(driveTo([{ throw: FOUR_SIXES }])).chosen).toEqual({ type: "score", playerId: ALICE, category: "poker" });
  });

  it("one throw later the same five dice are held for the generala instead", () => {
    expect(decide(driveTo(turnShowing(FOUR_SIXES))).chosen).toEqual({ type: "hold", playerId: ALICE, keep: KEEP_THE_SIXES });
  });

  /**
   * The boundary itself, with both sides read off the ENGINE rather than
   * written down as literals. The hold is worth the same 41.67 on both throws
   * — a leaf evaluated at `rollsUsed` instead of `rollsUsed + 1` would collect
   * the bonus on that side too and answer 45.83 — so the only thing that moved
   * between the two decisions above is what the box itself pays.
   */
  it("the hold is worth the same on both throws, and only the box's own value moved", () => {
    const servida = asked(driveTo([{ throw: FOUR_SIXES }])).view;
    const armada = asked(driveTo(turnShowing(FOUR_SIXES))).view;
    expect(expectedValueOfHold(servida, KEEP_THE_SIXES)).toBeCloseTo(250 / 6, 10);
    expect(expectedValueOfHold(armada, KEEP_THE_SIXES)).toBeCloseTo(250 / 6, 10);
    expect(immediateValue(servida, "poker")).toBe(45);
    expect(immediateValue(armada, "poker")).toBe(40);
  });
});
