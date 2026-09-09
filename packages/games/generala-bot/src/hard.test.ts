import { describe, expect, it } from "vitest";
import { getLegalActions, getViewFor } from "@hexdev/generala-engine";
import type { CategoryId, DieFace, GeneralaAction, MatchState, PlayerView } from "@hexdev/generala-engine";
import { ALICE, driveTo, turnShowing } from "./fixtures.js";
import type { DriveStep } from "./fixtures.js";
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
    // Seat 0 spends two turns getting there: a zero goes in the highest-paying
    // open box, so crossing the generala costs the doble first (ruleset §Orden
    // obligatorio de tachado). Seat 1's card keeps its generala open, which is
    // the whole difference the case is about.
    const state = driveTo([
      { throw: NOTHING_HAND },
      { score: "generala-doble" },
      { throw: NOTHING_HAND },
      { score: "ones" },
      { throw: NOTHING_HAND },
      { score: "generala" },
      { throw: [1, 2, 3, 4, 6] },
      { hold: [] },
      { throw: FOUR_SIXES },
    ]);
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

/** One category written by each seat in turn, so a two-seat match really walks to the position. */
function bothSeatsWrite(categories: readonly CategoryId[]): readonly DriveStep[] {
  return categories.flatMap((category) => [{ throw: NOTHING_HAND }, { score: category }, { throw: NOTHING_HAND }, { score: category }]);
}

/** The seat that is not under test taking its turn, so the table comes back round. */
function theOtherSeatWrites(category: CategoryId): readonly DriveStep[] {
  return [{ throw: NOTHING_HAND }, { score: category }];
}

/** Throw, keep nothing, throw, keep nothing, throw: the turn arrives at the third roll with no hold left to offer. */
const TO_THE_LAST_THROW: readonly DriveStep[] = [{ throw: NOTHING_HAND }, { hold: [] }, { throw: NOTHING_HAND }, { hold: [] }, { throw: NOTHING_HAND }];

/**
 * WHAT THE CROSSING LADDER TOOK AWAY FROM THIS TIER, MEASURED RATHER THAN
 * ASSERTED IN A COMMENT.
 *
 * This describe used to hand `hard` three boxes tied at zero and check that
 * `SACRIFICE_ORDER` picked the middle one. That fixture is unreachable now: a
 * zero may only go in the highest-paying open box, so when every open box is
 * worth nothing the engine offers exactly ONE of them and there is no tie left
 * to break. The tier is not wrong; the question is no longer asked of it.
 *
 * A THREE-WAY TIE ABOVE ZERO IS NOT CONSTRUCTIBLE EITHER, and it is worth
 * saying why rather than leaving the coverage gap silent. Within the upper
 * section `SACRIFICE_ORDER` rises with the face, so any tie among upper boxes
 * is broken toward the box `CATEGORY_IDS` lists first and the two readings
 * agree; a tie across sections needs an upper box paying 20-50, which only five
 * of a kind reaches, and that hand pays `full` 30 and `poker` 40 rather than a
 * third 30. So the pair below is the widest disagreement the rules allow, and
 * it separates "no tie-break at all" from "the ladder". The remaining mutation
 * — keeping the LAST best instead of the first — is separated by the doble case
 * further down, where the answer would flip from a box to a hold.
 */
describe("the ladder still breaks a tie, but only above zero — the rule owns the zero case now", () => {
  it("offers one box and no choice when every open box is worth nothing", () => {
    const state = driveTo([...bothSeatsWrite(["ones", "threes", "fours", "sixes"]), ...TO_THE_LAST_THROW]);
    const { view, legal } = asked(state);

    // Seven boxes open, every one of them worth nothing on `[1,1,3,4,6]`, and
    // the engine offers the top of the crossing ladder alone.
    expect(legal.map((action) => (action.type === "score" ? action.category : "hold"))).toEqual(["generala-doble"]);
    expect(immediateValue(view, "generala-doble")).toBe(0);
    expect(decide(state).chosen).toEqual({ type: "score", playerId: ALICE, category: "generala-doble" });
  });

  it("prefers `full` over `sixes` when both pay thirty, which is the ladder and not the printed order", () => {
    // Five 6s with the doble and the generala already crossed: `sixes` pays 30
    // and `full` pays 30 (five of a kind contains 3 + 2), the doble pays
    // nothing because the generala box holds a zero, and the póker box is
    // spent. `sixes` comes BEFORE `full` on the card and AFTER it on the
    // ladder, so a tier with no tie-break answers `sixes`.
    const state = driveTo([
      ...turnShowing([4, 4, 4, 4, 1]),
      { score: "poker" },
      ...theOtherSeatWrites("ones"),
      ...turnShowing(NOTHING_HAND),
      { score: "generala-doble" },
      ...theOtherSeatWrites("threes"),
      ...turnShowing(NOTHING_HAND),
      { score: "generala" },
      ...theOtherSeatWrites("fours"),
      ...turnShowing([6, 6, 6, 6, 6]),
    ]);
    const { view, legal } = asked(state);

    expect(immediateValue(view, "sixes")).toBe(30);
    expect(immediateValue(view, "full")).toBe(30);
    expect(legal.flatMap((action) => (action.type === "score" ? [action.category] : []))).toEqual(["sixes", "full"]);
    expect(decide(state).chosen).toEqual({ type: "score", playerId: ALICE, category: "full" });
  });
});

/**
 * THE DOBLE IS THE ONE BOX A SEAT CAN BE LEFT ALONE WITH, AND IT IS NEVER DEAD
 * ANY MORE.
 *
 * This case used to be the exact hold/score tie at zero: seat 0 crossed its
 * generala, `hasScoredGenerala` went false, and the doble paid 100 to nobody
 * for the rest of the match. THE CROSSING LADDER MADE THAT POSITION
 * UNREACHABLE, and the argument is short. A zero goes only in the highest
 * paying open box, so writing 0 in the generala box requires the doble to be
 * spent first. Therefore an open doble sits above a generala box that is either
 * still open or holds a real generala — and if the doble is the LAST open box,
 * the generala above it was scored. The 100 is always live.
 *
 * So the tie is gone and what is asserted instead is the consequence: with one
 * box left and two throws in hand, the tier CHASES the hundred rather than
 * writing a zero, because every leaf that lands five of a kind is worth 100 and
 * the box on the table is worth nothing. That is the same arithmetic the old
 * case rested on, read the other way round.
 *
 * It still catches the other reading of "open": counting FILLED boxes as
 * available would let the leaf score a box that is gone.
 */
describe("with the last box a hundred away, it spends the throw instead of writing a zero", () => {
  it("the doble alone always has a real generala above it, so holding for it beats crossing it", () => {
    // Ten boxes each, every one written for a REAL value, so no crossing
    // happens anywhere and the ladder never comes into it. `turnShowing` takes
    // two throws, which is what lets five of a kind appear at all: on a turn's
    // opening throw it would win the match outright.
    const bothSeatsWriteOn = (faces: readonly DieFace[], category: CategoryId): readonly DriveStep[] => [
      ...turnShowing(faces),
      { score: category },
      ...turnShowing(faces),
      { score: category },
    ];
    const state = driveTo([
      ...bothSeatsWriteOn([6, 6, 6, 6, 6], "generala"),
      ...bothSeatsWriteOn(NOTHING_HAND, "ones"),
      ...bothSeatsWriteOn([2, 2, 1, 3, 4], "twos"),
      ...bothSeatsWriteOn(NOTHING_HAND, "threes"),
      ...bothSeatsWriteOn(NOTHING_HAND, "fours"),
      ...bothSeatsWriteOn([5, 5, 1, 3, 4], "fives"),
      ...bothSeatsWriteOn(NOTHING_HAND, "sixes"),
      ...bothSeatsWriteOn([1, 2, 3, 4, 5], "escalera"),
      ...bothSeatsWriteOn([2, 2, 2, 3, 3], "full"),
      ...bothSeatsWriteOn([4, 4, 4, 4, 1], "poker"),
      { throw: FOUR_SIXES },
    ]);
    const { view, legal } = asked(state);

    // The premise: one box left, the generala above it is REAL, and the box on
    // the table is worth nothing right now.
    expect(view.cards[0]?.generala).toBe(50);
    expect(legal.filter((action) => action.type === "score").length).toBe(1);
    expect(legal.filter((action) => action.type === "hold").length).toBe(31);
    expect(immediateValue(view, "generala-doble")).toBe(0);
    // One re-roll of the odd die out of `[6,6,6,6,2]` is a sixth of a hundred.
    expect(expectedValueOfHold(view, KEEP_THE_SIXES)).toBeCloseTo(100 / 6, 10);

    expect(decide(state).chosen).toEqual({ type: "hold", playerId: ALICE, keep: KEEP_THE_SIXES });
  });
});
describe("the tier is total, and its off-phase arm answers rather than throws", () => {
  /**
   * `awaiting-roll` offers nobody anything, so this list cannot arrive through
   * the engine — it is constructible AT THE TIER, though, which is exactly the
   * argument `easy.ts` already makes for its own out-of-range case and slice 16
   * re-made for `normal.ts`'s fall-back. D7's second layer is that no tier's
   * path carries a throw, and an unreachable arm is where that would be easiest
   * to forget.
   *
   * WHAT IT ANSWERS THERE WAS MEASURED, NOT PREDICTED. The first draft asserted
   * "the first action offered" on the reasoning that everything values at 0 and
   * a strict `>` keeps the first — and it went red, because the LADDER still
   * breaks the tie. `ones` is rank 1 and `sixes` is rank 10, so the cheaper box
   * wins even here. That is worth pinning rather than papering over: it is also
   * the proof that a phase guard returning `legalActions[0]` would NOT be a
   * redundant second mechanism but a different answer, which is why this tier
   * carries no such guard instead of carrying one nobody could distinguish.
   */
  it("handed a position with no dice showing, every value is zero and the ladder still decides", () => {
    const waiting = driveTo([{ throw: [1, 2, 3, 4, 6] }, { hold: [0] }]);
    expect(waiting.turn.phase).toBe("awaiting-roll");

    const view = getViewFor(waiting, ALICE);
    const invented: NonEmptyActions = [
      { type: "score", playerId: ALICE, category: "sixes" },
      { type: "score", playerId: ALICE, category: "ones" },
    ];
    expect(immediateValue(view, "sixes")).toBe(0);
    expect(expectedValueOfHold(view, [])).toBe(0);
    // The cheaper box, which is the SECOND offered — so this is not the loop
    // falling through to its seed.
    expect(hard.chooseAction(view, invented, ROOM_BUDGET_MS)).toBe(invented[1]);
  });
});
