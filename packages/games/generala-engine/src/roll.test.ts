import { describe, expect, it } from "vitest";

import type { Dice, DieFace } from "./dice.js";
import type { PlayerId } from "./ids.js";
import { applyRoll } from "./roll.js";
import type { ApplyResult } from "./violation.js";
import { createMatch } from "./state.js";
import type { CategoryId, MatchState, Scorecard } from "./state.js";

const ALICE = "player-0" as PlayerId;
const BOB = "player-1" as PlayerId;

/**
 * A mid-turn `awaiting-roll` state, on a table `createMatch` built.
 *
 * The seats and the cards come from the producer; only `turn` is written here,
 * and it HAS to be — the one thing that puts a turn back into `awaiting-roll`
 * after the opening one is the `hold` reducer, which is the next slice's work.
 * `state.test.ts` already carries the lesson a test-assembled state teaches (it
 * can only read back what the test put there), so nothing below asserts a field
 * this helper wrote unless `applyRoll` rewrote it first.
 */
function awaitingRoll(slots: readonly (DieFace | null)[], rollsUsed: number, seat = 0): MatchState {
  const base = createMatch([ALICE, BOB]);
  return { ...base, turn: { phase: "awaiting-roll", seat, rollsUsed, slots } };
}

/** The same, with one seat's card pre-filled at the named boxes. */
function withFilledBoxes(state: MatchState, seat: number, filled: Partial<Record<CategoryId, number>>): MatchState {
  return {
    ...state,
    cards: state.cards.map((card, index) => (index === seat ? ({ ...card, ...filled } as Scorecard) : card)),
  };
}

/** Unwrap an accepted result, naming the refusal when there is one. */
function accepted(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`expected the roll to be accepted, and it was refused: ${result.violation.code} — ${result.violation.message}`);
  return result.state;
}

/** Unwrap a refusal, naming the state when the roll was accepted instead. */
function refused(result: ApplyResult): { readonly code: string; readonly message: string } {
  if (result.ok) throw new Error(`expected the roll to be refused, and it was accepted into ${JSON.stringify(result.state.turn)}`);
  return result.violation;
}

describe("applyRoll — the faces land in the empty slots, by position", () => {
  it("splices the carried faces into the empty slots and leaves every held die untouched", () => {
    // The spec's own worked example: dice [6,6,1,2,3], a hold of indices [0,1],
    // so three faces travel and the two 6s do not. Indices 0 and 1 must read 6
    // afterwards because they are THE SAME DICE — an action carrying all five
    // final faces could quietly change them and nothing would notice.
    const state = awaitingRoll([6, 6, null, null, null], 1);

    const turn = accepted(applyRoll(state, [4, 5, 2])).turn;

    expect(turn).toEqual({ phase: "deciding", seat: 0, rollsUsed: 2, dice: [6, 6, 4, 5, 2] });
  });

  it("fills whichever slots are empty, not the last ones", () => {
    // Triangulation, and the case that kills the obvious wrong implementation:
    // "keep the held faces, then append the new ones" gives [4,6,1,2,3] here
    // and is indistinguishable from correct on the test above, where the held
    // dice happen to sit at the front.
    const state = awaitingRoll([null, 4, null, 6, null], 2);

    const turn = accepted(applyRoll(state, [1, 2, 3])).turn;

    expect(turn).toEqual({ phase: "deciding", seat: 0, rollsUsed: 3, dice: [1, 4, 2, 6, 3] });
  });

  it("rolls all five on the opening roll of a match nobody has touched", () => {
    const state = createMatch([ALICE, BOB]);

    const turn = accepted(applyRoll(state, [3, 1, 4, 1, 5])).turn;

    expect(turn).toEqual({ phase: "deciding", seat: 0, rollsUsed: 1, dice: [3, 1, 4, 1, 5] });
  });

  it("keeps the seat that was on turn", () => {
    // Seat 1, so a hardcoded `seat: 0` in the reducer reds here rather than
    // surviving until a two-seat match silently plays itself twice.
    const state = awaitingRoll([null, null, null, null, null], 0, 1);

    const turn = accepted(applyRoll(state, [2, 2, 3, 4, 6])).turn;

    expect(turn).toEqual({ phase: "deciding", seat: 1, rollsUsed: 1, dice: [2, 2, 3, 4, 6] });
  });
});

describe("applyRoll — what it refuses", () => {
  it("refuses a face count that is not the number of empty slots", () => {
    // Three slots are empty, so three faces is the only correct carry. Too few
    // would leave a `null` in a finished hand; too many would silently drop a
    // face the rng was already charged for, which is the entropy budget's whole
    // point of failure.
    const state = awaitingRoll([6, 6, null, null, null], 1);

    expect(refused(applyRoll(state, [4, 5])).code).toBe("wrong-face-count");
    expect(refused(applyRoll(state, [4, 5, 2, 1])).code).toBe("wrong-face-count");
    // Pure: the refused calls left the caller's own state exactly as it was.
    expect(state.turn).toEqual({ phase: "awaiting-roll", seat: 0, rollsUsed: 1, slots: [6, 6, null, null, null] });
  });

  it("refuses a roll in any phase but awaiting-roll", () => {
    // The transport LOOPS: it re-asks for a system action after applying one.
    // A reducer that accepted a roll in `deciding` would re-roll the player's
    // dice under them, forever.
    const decided = accepted(applyRoll(createMatch([ALICE, BOB]), [3, 1, 4, 1, 5]));
    const won = accepted(applyRoll(createMatch([ALICE, BOB]), [3, 3, 3, 3, 3]));

    expect(refused(applyRoll(decided, [1, 2, 3, 4, 5])).code).toBe("not-awaiting-roll");
    expect(refused(applyRoll(won, [1, 2, 3, 4, 5])).code).toBe("not-awaiting-roll");
  });

  it("takes the state and the faces, and nothing else — there is no playerId to forge", () => {
    // THE SECURITY CONTRACT, asserted where it can be broken. A seated truco
    // player can deal themselves a hand because the dealing action carries a
    // playerId the module gates on; this reducer has no such argument, so no
    // submitted value can reach it. A third parameter would make the
    // `@ts-expect-error` below unused, and `tsc -b` fails on an unused one.
    const state = createMatch([ALICE, BOB]);

    // @ts-expect-error applyRoll takes exactly (state, faces): there is no actor to name.
    applyRoll(state, [1, 2, 3, 4, 5], ALICE);

    expect(applyRoll).toHaveLength(2);
  });
});

describe("applyRoll — a generala on the opening roll wins where it is rolled", () => {
  it("ends the match the moment the roll is applied, before any choice is offered", () => {
    const state = createMatch([ALICE, BOB]);

    const next = accepted(applyRoll(state, [3, 3, 3, 3, 3]));

    expect(next.turn).toEqual({ phase: "servida-win", seat: 0 });
    // It is not a scoring event: nothing was written to any card.
    expect(next.cards.every((card) => Object.values(card).every((box) => box === null))).toBe(true);
  });

  it("carries nothing to score with — the winning turn has no dice and no roll counter", () => {
    // This is what "before any choice is offered" MEANS structurally, and it is
    // why the win is a union arm rather than a flag beside `turn`: there is no
    // representable state that is both `deciding` and already won, so no offer
    // list has to remember to fall silent.
    const won = accepted(applyRoll(createMatch([ALICE, BOB]), [5, 5, 5, 5, 5]));

    expect(Object.keys(won.turn).sort()).toEqual(["phase", "seat"]);
  });

  it("wins outright even when that number's own box is already filled", () => {
    const state = withFilledBoxes(createMatch([ALICE, BOB]), 0, { threes: 9 });

    expect(accepted(applyRoll(state, [3, 3, 3, 3, 3])).turn).toEqual({ phase: "servida-win", seat: 0 });
  });

  it("wins outright even when the generala box is filled — it does not become a doble score", () => {
    // Carried from the decided reading of proposal question 2: the match ends,
    // so the 100 is never paid here. That is what makes generala doble ONLY
    // ever reachable armada.
    const state = withFilledBoxes(createMatch([ALICE, BOB]), 0, { generala: 50 });

    const next = accepted(applyRoll(state, [4, 4, 4, 4, 4]));

    expect(next.turn).toEqual({ phase: "servida-win", seat: 0 });
    expect(next.cards[0]!["generala-doble"]).toBeNull();
  });

  it("names the seat that rolled it, not seat 0", () => {
    const state = awaitingRoll([null, null, null, null, null], 0, 1);

    expect(accepted(applyRoll(state, [6, 6, 6, 6, 6])).turn).toEqual({ phase: "servida-win", seat: 1 });
  });

  it("is not a servida win on any roll but the first", () => {
    // Triangulation on the roll boundary. Five of a kind remade on a later roll
    // is worth 50 in the generala box and nothing more — an implementation
    // testing only `isGenerala` would end the match here.
    const state = awaitingRoll([null, null, null, null, null], 1);

    expect(accepted(applyRoll(state, [3, 3, 3, 3, 3])).turn).toEqual({
      phase: "deciding",
      seat: 0,
      rollsUsed: 2,
      dice: [3, 3, 3, 3, 3],
    });
  });
});

describe("applyRoll — purity", () => {
  it("agrees with itself and leaves the state it was handed alone", () => {
    // `conformance.ts:75` pins this for the whole module by executed test; the
    // reducer underneath it is where the property actually has to hold.
    const state = awaitingRoll([6, 6, null, null, null], 1);
    const before = JSON.parse(JSON.stringify(state)) as MatchState;
    const faces: readonly DieFace[] = [4, 5, 2];

    const first = applyRoll(state, faces);
    const second = applyRoll(state, faces);

    expect(first).toEqual(second);
    expect(state).toEqual(before);
  });

  it("agrees with itself when it refuses, too", () => {
    const dice: Dice = [3, 1, 4, 1, 5];
    const decided = accepted(applyRoll(createMatch([ALICE, BOB]), dice));

    expect(applyRoll(decided, [1, 2])).toEqual(applyRoll(decided, [1, 2]));
  });
});
