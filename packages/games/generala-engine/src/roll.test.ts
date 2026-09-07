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

describe("applyRoll — a face has to be a face", () => {
  /**
   * `DieFace` IS COMPILE-TIME ONLY, AND THIS BLOCK IS THE RUNTIME HALF.
   *
   * The union `1|2|3|4|5|6` is erased before a single value moves, so every
   * cast below is what a SECOND PRODUCER looks like from in here: a bot
   * replaying a recorded match, a state migration, a fixture written by hand.
   * `generala-module` is the only producer today and its `rollDie` is total
   * over `RandomSource`'s contractual `[0, 1)`, so nothing on the shipped path
   * can reach these lines — but that is a fact about today's callers, not about
   * this reducer, and an L0 engine's contract cannot be conditional on its one
   * current caller behaving.
   *
   * THERE IS NO "EVERY FACE IS ACCEPTED" SIBLING HERE, AND THAT IS MEASURED
   * RATHER THAN AN OMISSION. One was written — six faces across five positions,
   * thirty rolls — and then removed, because a guard refusing EVERY roll reds
   * seven of this package's nine test files, two of which (`play.test.ts` and
   * `view.test.ts`) stop collecting altogether: they drive whole matches
   * through `applyRoll`, so an ordinary face being refused is not something
   * they can survive. The four tests in the first describe of this very file
   * are the same fence at closer range. A mutation a pre-existing test already
   * catches proves nothing about a new one, and a duplicated fence is two
   * places to fix one thing.
   */
  const notAFace = (value: number): DieFace => value as DieFace;

  it("refuses a face outside the six, wherever it sits in the carry", () => {
    // Last, first and middle: a guard that only looked at `faces[0]` passes a
    // one-element case and would splice this 7 into the third slot.
    const state = awaitingRoll([6, 6, null, null, null], 1);

    expect(refused(applyRoll(state, [4, 5, notAFace(7)])).code).toBe("malformed-face");
    expect(refused(applyRoll(state, [notAFace(0), 5, 2])).code).toBe("malformed-face");
    expect(refused(applyRoll(state, [4, notAFace(-1), 2])).code).toBe("malformed-face");
  });

  it("refuses a number between the faces, and a number that is no number at all", () => {
    // THE TWO CASES THAT SEPARATE MEMBERSHIP FROM A RANGE COMPARISON, and the
    // reason the guard is written against `DIE_FACES` rather than as
    // `face < 1 || face > 6`. That comparison admits 1.5 — inside the range and
    // not a face — and admits NaN, because every comparison against NaN is
    // false. A die shows one of six things; it does not show a point on an
    // interval.
    const state = createMatch([ALICE, BOB]);

    expect(refused(applyRoll(state, [1, 2, 3, 4, notAFace(1.5)])).code).toBe("malformed-face");
    expect(refused(applyRoll(state, [1, 2, 3, 4, notAFace(Number.NaN)])).code).toBe("malformed-face");
  });

  it("refuses a whole cup of impossible faces, which the scorer would otherwise value at nothing at all", () => {
    // THE HARM, MEASURED RATHER THAN GUESSED — and it is not the loud one it
    // looks like. `[7,7,7,7,7]` is NOT read as a generala: `counts` zeroes a
    // tally over `DIE_FACES` and then increments `tally[7]`, which is
    // `undefined + 1`, so the seventh face lands as `NaN` and `someFaceShows`
    // never sees it. Run against the unguarded reducer, this roll was accepted
    // into `deciding`, all eleven boxes valued 0, and the acting seat was
    // offered the full 42 actions on five dice that show nothing.
    //
    // That silence is the argument for the guard, not against it: a seat gets a
    // turn it can only cross out, and the state that did it is a legal-looking
    // `deciding` nobody would think to question. The guard therefore runs
    // BEFORE the splice rather than merely before the caller reads the dice
    // back.
    const state = createMatch([ALICE, BOB]);
    const impossible = [7, 7, 7, 7, 7].map(notAFace);

    expect(refused(applyRoll(state, impossible)).code).toBe("malformed-face");
    // It refuses the same way twice, and the caller's own state is exactly what
    // it handed in.
    expect(applyRoll(state, impossible)).toEqual(applyRoll(state, impossible));
    expect(state.turn).toEqual({ phase: "awaiting-roll", seat: 0, rollsUsed: 0, slots: [null, null, null, null, null] });
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
