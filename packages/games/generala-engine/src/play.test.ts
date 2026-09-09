import { describe, expect, it } from "vitest";

import type { Dice } from "./dice.js";
import type { PlayerId } from "./ids.js";
import { getLegalActions } from "./legal-actions.js";
import { applyHold, applyPlayerAction, applyScore } from "./play.js";
import { applyRoll } from "./roll.js";
import { scoreFor } from "./scoring.js";
import { CATEGORY_IDS, createMatch } from "./state.js";
import type { CategoryId, MatchState, Scorecard } from "./state.js";
import type { ApplyResult } from "./violation.js";

const ALICE = "player-0" as PlayerId;
const BOB = "player-1" as PlayerId;
const CAROL = "player-2" as PlayerId;
const STRANGER = "nobody-at-this-table" as PlayerId;

/** The `deciding` state a real opening roll produces — never assembled here. */
function openingRoll(seats: readonly PlayerId[], dice: Dice): MatchState {
  const result = applyRoll(createMatch(seats), dice);
  if (!result.ok) throw new Error(`the opening roll was refused: ${result.violation.code}`);
  return result.state;
}

function hold(state: MatchState, playerId: PlayerId, keep: readonly number[]): MatchState {
  const result = applyHold(state, { type: "hold", playerId, keep });
  if (!result.ok) throw new Error(`the hold was refused: ${result.violation.code}`);
  return result.state;
}

function roll(state: MatchState, faces: readonly Dice[number][]): MatchState {
  const result = applyRoll(state, faces);
  if (!result.ok) throw new Error(`the roll was refused: ${result.violation.code}`);
  return result.state;
}

function slotsOf(state: MatchState): readonly (number | null)[] {
  const turn = state.turn;
  if (turn.phase !== "awaiting-roll") throw new Error(`expected to be awaiting a roll, and the turn is ${turn.phase}`);
  return turn.slots;
}

function rollsUsedOf(state: MatchState): number {
  const turn = state.turn;
  if (turn.phase === "servida-win") throw new Error("a won turn has no roll counter");
  return turn.rollsUsed;
}

function score(state: MatchState, playerId: PlayerId, category: CategoryId): MatchState {
  return accepted(applyScore(state, { type: "score", playerId, category }));
}

/** Unwrap an accepted result, naming the refusal when there is one. */
function accepted(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`expected the action to be accepted, and it was refused: ${result.violation.code} — ${result.violation.message}`);
  return result.state;
}

/** Unwrap a refusal, naming the state when the action was accepted instead. */
function refused(result: ApplyResult): { readonly code: string; readonly message: string } {
  if (result.ok) throw new Error(`expected the action to be refused, and it was accepted into ${JSON.stringify(result.state.turn)}`);
  return result.violation;
}

/** Which boxes carry a number — 0 included, because 0 is filled. */
function filledBoxesOf(card: Scorecard): readonly CategoryId[] {
  return CATEGORY_IDS.filter((category) => card[category] !== null);
}

describe("applyHold — a hold names positions, and two dice showing the same face are different dice", () => {
  it("keeps the die at the index it names and re-rolls the one showing the same face", () => {
    // The scenario a `keep` carrying FACES cannot express at all: both 4s are
    // the same face and different dice, and holding "a 4" says nothing about
    // which one survives.
    const state = openingRoll([ALICE, BOB], [4, 4, 2, 6, 1]);

    expect(slotsOf(hold(state, ALICE, [0]))).toEqual([4, null, null, null, null]);
    expect(slotsOf(hold(state, ALICE, [1]))).toEqual([null, 4, null, null, null]);
  });

  it("keeps several dice, each at its own position", () => {
    const state = openingRoll([ALICE, BOB], [6, 6, 1, 2, 3]);

    expect(slotsOf(hold(state, ALICE, [0, 1]))).toEqual([6, 6, null, null, null]);
    // Interleaved, so an implementation that packs the kept dice at the front
    // and re-rolls the tail cannot pass this by accident.
    expect(slotsOf(hold(state, ALICE, [1, 3]))).toEqual([null, 6, null, 2, null]);
  });

  it("re-rolls all five on an empty keep, which the rulebook permits explicitly", () => {
    const state = openingRoll([ALICE, BOB], [4, 4, 2, 6, 1]);

    const held = hold(state, ALICE, []);

    expect(slotsOf(held)).toEqual([null, null, null, null, null]);
    expect(held.turn.phase).toBe("awaiting-roll");
  });

  it("does not consume a roll — the throw does", () => {
    // `rollsUsed` counts throws, not decisions. A hold that incremented it
    // would give the player two rolls instead of three.
    const state = openingRoll([ALICE, BOB], [4, 4, 2, 6, 1]);
    expect(rollsUsedOf(state)).toBe(1);

    expect(rollsUsedOf(hold(state, ALICE, [0, 1]))).toBe(1);
    expect(rollsUsedOf(roll(hold(state, ALICE, [0, 1]), [3, 3, 3]))).toBe(2);
  });

  it("leaves the seat, the seat order and every scorecard alone", () => {
    const state = openingRoll([ALICE, BOB, CAROL], [4, 4, 2, 6, 1]);

    const held = hold(state, ALICE, [2]);

    expect(held.players).toEqual(state.players);
    expect(held.cards).toEqual(state.cards);
    expect(held.turn.seat).toBe(0);
  });
});

describe("applyHold — the refusals, each with its own reason", () => {
  const state = openingRoll([ALICE, BOB], [4, 4, 2, 6, 1]);
  const before = JSON.stringify(state);

  it("refuses holding all five: a re-roll of zero dice burns a roll and means nothing", () => {
    const result = applyHold(state, { type: "hold", playerId: ALICE, keep: [0, 1, 2, 3, 4] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.violation.code).toBe("malformed-hold");
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each([
    { name: "a repeated index", keep: [0, 0] },
    { name: "an index off the end", keep: [5] },
    { name: "a negative index", keep: [-1] },
    { name: "an index that is not whole", keep: [1.5] },
    { name: "the right indices in the wrong order", keep: [1, 0] },
    { name: "all five, spelled backwards", keep: [4, 3, 2, 1, 0] },
  ])("refuses $name", ({ keep }) => {
    const result = applyHold(state, { type: "hold", playerId: ALICE, keep });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.violation.code).toBe("malformed-hold");
    expect(JSON.stringify(state)).toBe(before);
  });

  it("refuses a hold once the third roll has been used, and says THAT is why", () => {
    // Reached through the real pipeline rather than assembled: roll, hold,
    // roll, hold, roll is the whole turn, and the counter arriving at 3 that
    // way is what makes "three and no more" a fact about the engine.
    const third = roll(hold(roll(hold(state, ALICE, [0, 1]), [1, 2, 3]), ALICE, [0]), [2, 2, 2, 2]);
    expect(rollsUsedOf(third)).toBe(3);

    const result = applyHold(third, { type: "hold", playerId: ALICE, keep: [0] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // NOT `malformed-hold`: `[0]` is a perfectly well-formed hold. What is
    // gone is the roll it was asking for.
    expect(result.violation.code).toBe("no-rolls-left");
  });

  it("refuses a hold while the cup is still shaking, and once a servida has won", () => {
    const awaiting = hold(state, ALICE, [0]);
    const won = openingRoll([ALICE, BOB], [3, 3, 3, 3, 3]);
    expect(won.turn.phase).toBe("servida-win");

    for (const unavailable of [awaiting, won]) {
      const result = applyHold(unavailable, { type: "hold", playerId: ALICE, keep: [0] });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.violation.code).toBe("not-deciding");
    }
  });

  it("refuses a hold from a seat that is not on turn, and from an id that is not seated", () => {
    for (const outsider of [BOB, STRANGER]) {
      const result = applyHold(state, { type: "hold", playerId: outsider, keep: [0] });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.violation.code).toBe("not-on-turn");
    }
  });
});

describe("applyHold — purity", () => {
  it("agrees with itself, and leaves the state it was handed alone", () => {
    const state = openingRoll([ALICE, BOB], [4, 4, 2, 6, 1]);
    const before = JSON.stringify(state);

    const first = applyHold(state, { type: "hold", playerId: ALICE, keep: [0, 3] });
    const second = applyHold(state, { type: "hold", playerId: ALICE, keep: [0, 3] });

    expect(first).toEqual(second);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("agrees with itself on a refusal too", () => {
    const state = openingRoll([ALICE, BOB], [4, 4, 2, 6, 1]);
    const before = JSON.stringify(state);

    const first = applyHold(state, { type: "hold", playerId: ALICE, keep: [3, 0] });
    const second = applyHold(state, { type: "hold", playerId: ALICE, keep: [3, 0] });

    expect(first).toEqual(second);
    expect(JSON.stringify(state)).toBe(before);
  });
});


describe("applyScore — one box per turn, and the turn passes", () => {
  it("fills the named box at what the dice yield, and nothing else on the card", () => {
    // The ruleset's own worked example: sixes on [6,6,6,2,1] is 18.
    const state = openingRoll([ALICE, BOB], [6, 6, 6, 2, 1]);

    const scored = score(state, ALICE, "sixes");

    expect(scored.cards[0]!.sixes).toBe(18);
    expect(filledBoxesOf(scored.cards[0]!)).toEqual(["sixes"]);
    // The other seat's card is not this turn's business.
    expect(scored.cards[1]).toEqual(state.cards[1]);
  });

  it("crosses a box out at zero, and a crossed box is a filled box", () => {
    // "Crossing out" has no action type in this game. It is a `score` aimed at
    // a box that evaluates to nothing, and forced crossing then falls straight
    // out of "one box per turn, obligatorio".
    //
    // The box is `generala-doble` because on an untouched card that is the one
    // a zero may go in (ruleset §Orden obligatorio de tachado). `fives` here
    // would also be worth nothing and is refused for that reason alone, which
    // is the case the refusals below cover.
    const state = openingRoll([ALICE, BOB], [1, 1, 2, 3, 4]);

    const scored = score(state, ALICE, "generala-doble");

    expect(scored.cards[0]!["generala-doble"]).toBe(0);
    expect(filledBoxesOf(scored.cards[0]!)).toEqual(["generala-doble"]);
  });

  it("passes the turn to the next seat in order, and wraps at the last one", () => {
    // `(seat + 1) % players.length`, played out rather than asserted about: no
    // rule in this engine names a seat count, so a three-seat table is the same
    // code path a two-seat one takes.
    const first = openingRoll([ALICE, BOB, CAROL], [6, 6, 6, 2, 1]);
    expect(first.turn.seat).toBe(0);

    const second = score(first, ALICE, "sixes");
    expect(second.turn.seat).toBe(1);

    const third = score(roll(second, [1, 2, 3, 4, 5]), BOB, "escalera");
    expect(third.turn.seat).toBe(2);

    const wrapped = score(roll(third, [2, 2, 2, 3, 3]), CAROL, "full");
    expect(wrapped.turn.seat).toBe(0);
  });

  it("opens the next turn awaiting a roll, with the counter back at zero and every slot empty", () => {
    // And this is where "a player may stop early" is settled: the two throws
    // ALICE did not use are not carried anywhere, because the next turn is
    // built from nothing rather than from what was left of this one.
    const state = openingRoll([ALICE, BOB], [1, 2, 3, 4, 5]);
    expect(rollsUsedOf(state)).toBe(1);

    const scored = score(state, ALICE, "escalera");

    expect(scored.turn).toEqual({ phase: "awaiting-roll", seat: 1, rollsUsed: 0, slots: [null, null, null, null, null] });
  });

  it("reads the roll counter at scoring time, so servida is not a memory", () => {
    // The same five dice, scored on the first throw and on the third: 25 and
    // 20. This reducer hands `rollsUsed` to `scoreFor`, so an implementation
    // passing a constant scores one of these wrong.
    const servida = openingRoll([ALICE, BOB], [1, 2, 3, 4, 5]);
    const armada = roll(hold(roll(hold(servida, ALICE, [0, 1]), [3, 4, 5]), ALICE, [0, 1, 2]), [4, 5]);
    expect(rollsUsedOf(armada)).toBe(3);

    expect(score(servida, ALICE, "escalera").cards[0]!.escalera).toBe(25);
    expect(score(armada, ALICE, "escalera").cards[0]!.escalera).toBe(20);
  });

  it("lets the same five dice go into any box they are worth something in, each worth whatever its own rule says", () => {
    // [6,6,6,6,6] armada with generala, sixes and doble all open: 50, 30 and 0.
    // Four boxes pay here — five of a kind is also a full and also a póker —
    // and every one of them is offered wherever it sits, which is what makes
    // the rulebook's "a juego mayor may go into its own box or into that
    // number's box" free rather than a special case. The engine must NOT
    // second-guess the doble's 0: the 50 was available at the same moment and
    // the choice was the player's. The seven boxes worth nothing contribute
    // only `generala-doble`, the top of the crossing ladder.
    const armada = roll(hold(openingRoll([ALICE, BOB], [6, 6, 6, 2, 1]), ALICE, [0, 1, 2]), [6, 6]);
    expect(rollsUsedOf(armada)).toBe(2);

    const offered = getLegalActions(armada, ALICE).flatMap((action) => (action.type === "score" ? [action.category] : []));
    expect(offered).toEqual(["sixes", "full", "poker", "generala", "generala-doble"]);

    expect(score(armada, ALICE, "generala").cards[0]!.generala).toBe(50);
    expect(score(armada, ALICE, "sixes").cards[0]!.sixes).toBe(30);
    expect(score(armada, ALICE, "generala-doble").cards[0]!["generala-doble"]).toBe(0);
  });
});

describe("applyScore — the refusals", () => {
  it("never reopens a box, not even one crossed out at zero", () => {
    // Two rounds of the table, so ALICE meets her own crossed box again on the
    // one hand it would have been worth 50 for. The two crossings walk the
    // ladder — `generala-doble` first, because that is where a zero goes on an
    // untouched card, then `generala` once the doble is spent — which is also
    // what makes the second one reachable at all.
    const doble = score(openingRoll([ALICE, BOB], [1, 1, 2, 3, 4]), ALICE, "generala-doble");
    const crossed = score(roll(score(roll(doble, [1, 1, 2, 3, 4]), BOB, "twos"), [1, 1, 2, 3, 4]), ALICE, "generala");
    const opened = roll(score(roll(crossed, [1, 1, 2, 3, 4]), BOB, "threes"), [5, 5, 5, 5, 1]);
    // Five of a kind, ARMADA: on the opening throw it would have won the match
    // outright before any box could be chosen.
    const back = roll(hold(opened, ALICE, [0, 1, 2, 3]), [5]);

    expect(back.turn.seat).toBe(0);
    expect(back.cards[0]!.generala).toBe(0);
    expect(getLegalActions(back, ALICE)).not.toContainEqual({ type: "score", playerId: ALICE, category: "generala" });
    expect(refused(applyScore(back, { type: "score", playerId: ALICE, category: "generala" })).code).toBe("box-not-open");
  });

  it("refuses a score outside deciding, and from a seat that is not on turn", () => {
    const state = openingRoll([ALICE, BOB], [6, 6, 6, 2, 1]);
    const awaiting = hold(state, ALICE, [0]);
    const won = openingRoll([ALICE, BOB], [3, 3, 3, 3, 3]);

    expect(refused(applyScore(awaiting, { type: "score", playerId: ALICE, category: "sixes" })).code).toBe("not-deciding");
    expect(refused(applyScore(won, { type: "score", playerId: ALICE, category: "sixes" })).code).toBe("not-deciding");
    expect(refused(applyScore(state, { type: "score", playerId: BOB, category: "sixes" })).code).toBe("not-on-turn");
    expect(refused(applyScore(state, { type: "score", playerId: STRANGER, category: "sixes" })).code).toBe("not-on-turn");
  });

  it("agrees with itself and leaves the state it was handed alone, accepted or refused", () => {
    const state = openingRoll([ALICE, BOB], [6, 6, 6, 2, 1]);
    const before = JSON.stringify(state);

    const action = { type: "score", playerId: ALICE, category: "sixes" } as const;
    expect(applyScore(state, action)).toEqual(applyScore(state, action));
    const wrongSeat = { type: "score", playerId: BOB, category: "sixes" } as const;
    expect(applyScore(state, wrongSeat)).toEqual(applyScore(state, wrongSeat));
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("applyPlayerAction — the one door a seat's move comes through", () => {
  it("routes a hold to the hold reducer and a score to the score reducer", () => {
    // The module above this engine has a single `applyAction`; this is what it
    // will call for a player's move. `applyRoll` is deliberately NOT reachable
    // from here — the roll is the server's and takes no actor at all.
    const state = openingRoll([ALICE, BOB], [6, 6, 6, 2, 1]);
    const held = { type: "hold", playerId: ALICE, keep: [0, 1, 2] } as const;
    const scored = { type: "score", playerId: ALICE, category: "sixes" } as const;

    expect(applyPlayerAction(state, held)).toEqual(applyHold(state, held));
    expect(applyPlayerAction(state, scored)).toEqual(applyScore(state, scored));
  });

  it("carries the refusals through unchanged", () => {
    const state = openingRoll([ALICE, BOB], [6, 6, 6, 2, 1]);

    expect(refused(applyPlayerAction(state, { type: "hold", playerId: ALICE, keep: [1, 0] })).code).toBe("malformed-hold");
    expect(refused(applyPlayerAction(state, { type: "score", playerId: BOB, category: "sixes" })).code).toBe("not-on-turn");
  });
});

/**
 * ruleset §Orden obligatorio de tachado: a zero goes in the highest-paying open
 * box and nowhere else, down `Generala doble → Generala → Póker → Full →
 * Escalera → 6 → 5 → 4 → 3 → 2 → 1`. A value greater than zero stays free.
 *
 * THE REDUCER IS THE AUTHORITY AND THE OFFER LIST IS GUIDANCE, which is the
 * shape every other refusal in this engine has. `handleAction` gates on the
 * offer list, so an illegal cross is already unsubmittable through the room —
 * but a direct caller is not the room, and a rule that only exists in the
 * enumeration is a rule the reducer would happily break.
 */
describe("applyScore — a zero only goes in the highest-paying open box", () => {
  /** A card with these boxes already spent, so a ladder position can be reached
   * without playing the twenty turns it would take to walk down to it. */
  function withFilledBoxes(state: MatchState, seat: number, filled: Partial<Record<CategoryId, number>>): MatchState {
    return { ...state, cards: state.cards.map((card, index) => (index === seat ? ({ ...card, ...filled } as Scorecard) : card)) };
  }

  it("refuses a zero in an open box the ladder has not reached yet", () => {
    // `[4,4,6,3,2]` has no ace in it, so `ones` is the classic sacrifice — and
    // it is now the last box on the card a seat is allowed to spend, not the
    // first. The box IS open: this is a different refusal from `box-not-open`,
    // and a caller switching on the code can tell "you cannot write there yet"
    // from "you cannot write there ever".
    const state = openingRoll([ALICE, BOB], [4, 4, 6, 3, 2]);

    const refusal = refused(applyScore(state, { type: "score", playerId: ALICE, category: "ones" }));
    expect(refusal.code).toBe("cross-out-of-order");
    expect(state.cards[0]!.ones).toBeNull();
    // And it is refused for every box worth nothing except the top of the
    // ladder, rather than for the one this case happened to name.
    for (const category of ["fives", "escalera", "full", "poker", "generala"] as const) {
      expect(refused(applyScore(state, { type: "score", playerId: ALICE, category })).code).toBe("cross-out-of-order");
    }
    expect(accepted(applyScore(state, { type: "score", playerId: ALICE, category: "generala-doble" })).cards[0]!["generala-doble"]).toBe(0);
  });

  it("accepts a value greater than zero in any open box, wherever it sits on the ladder", () => {
    // The rule narrows crossing and NOTHING ELSE. `twos` pays 2 here while the
    // doble is the crossable box, and a seat that wants those two points may
    // take them — that is the choice the rule is meant to sharpen, not remove.
    const state = openingRoll([ALICE, BOB], [4, 4, 6, 3, 2]);

    expect(accepted(applyScore(state, { type: "score", playerId: ALICE, category: "twos" })).cards[0]!.twos).toBe(2);
    expect(accepted(applyScore(state, { type: "score", playerId: ALICE, category: "sixes" })).cards[0]!.sixes).toBe(6);
  });

  it("walks the whole ladder: the same zero is refused, then accepted, once every box above it is spent", () => {
    // THE FIXTURE THAT SEPARATES THE LADDER FROM ITS FIRST RUNG. A guard that
    // only ever protected `generala-doble` passes the case above and fails
    // here, and so does one that read the bot's `SACRIFICE_ORDER` — that ladder
    // is ordered by what a box COSTS to lose and would reach `ones` second.
    const state = openingRoll([ALICE, BOB], [4, 4, 6, 3, 2]);
    const ladder: readonly CategoryId[] = ["generala-doble", "generala", "poker", "full", "escalera", "sixes", "fives", "fours", "threes", "twos", "ones"];
    const spent: Partial<Record<CategoryId, number>> = {};

    for (const category of ladder) {
      const card = withFilledBoxes(state, 0, spent);
      // Everything still below this rung is refused; this rung is written.
      for (const lower of ladder.slice(ladder.indexOf(category) + 1)) {
        if (scoreFor(lower, [4, 4, 6, 3, 2], 1, card.cards[0]!) > 0) continue;
        expect(refused(applyScore(card, { type: "score", playerId: ALICE, category: lower })).code, `${lower} sits below ${category} and is worth nothing`).toBe("cross-out-of-order");
      }
      expect(accepted(applyScore(card, { type: "score", playerId: ALICE, category })).cards[0]![category]).not.toBeNull();
      spent[category] = 0;
    }

    // The loop is only worth something if it walked the whole card.
    expect(Object.keys(spent)).toHaveLength(CATEGORY_IDS.length);
  });
});
