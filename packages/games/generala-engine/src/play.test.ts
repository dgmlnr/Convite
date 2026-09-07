import { describe, expect, it } from "vitest";

import type { Dice } from "./dice.js";
import type { PlayerId } from "./ids.js";
import { applyHold } from "./play.js";
import { applyRoll } from "./roll.js";
import { createMatch } from "./state.js";
import type { MatchState } from "./state.js";

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
