import { describe, expect, it } from "vitest";

import { CATEGORY_IDS } from "./state.js";
import type { MatchState } from "./state.js";
import { createMatch } from "./state.js";
import type { PlayerId } from "./ids.js";

const ALICE = "player-0" as PlayerId;
const BOB = "player-1" as PlayerId;
const CAROL = "player-2" as PlayerId;
const DAVE = "player-3" as PlayerId;

describe("CATEGORY_IDS", () => {
  it("names eleven boxes, in the order a scorecard is printed", () => {
    // Eleven is the structural consequence of the chosen ruleset (#3838): the
    // six upper boxes, the four juegos mayores, and the doble. A twelfth or a
    // tenth is a different game, so the count is asserted rather than implied
    // by the union's own arm list.
    expect(CATEGORY_IDS).toEqual([
      "ones",
      "twos",
      "threes",
      "fours",
      "fives",
      "sixes",
      "escalera",
      "full",
      "poker",
      "generala",
      "generala-doble",
    ]);
  });

  it("has no duplicate box", () => {
    // A copy/paste slip inside the literal above would still satisfy the
    // length, and would silently give one box two cells on the scorecard.
    expect(new Set(CATEGORY_IDS).size).toBe(CATEGORY_IDS.length);
  });
});

describe("createMatch", () => {
  it("gives every seat its own scorecard, with all eleven boxes open", () => {
    const state = createMatch([ALICE, BOB]);

    expect(state.players).toEqual([ALICE, BOB]);
    expect(state.cards).toHaveLength(2);
    for (const card of state.cards) {
      expect(Object.keys(card).sort()).toEqual([...CATEGORY_IDS].sort());
      expect(Object.values(card).every((box) => box === null)).toBe(true);
    }
  });

  it("builds one scorecard per seat at any table size", () => {
    // D11: the engine never names a seat count. `seatCount: 2` is a fact about
    // the REGISTRATION, and a later three- or four-seat entry must need zero
    // engine change. A `createMatch` that ignored its argument and returned two
    // cards would pass the case above and fail this one.
    expect(createMatch([ALICE]).cards).toHaveLength(1);
    expect(createMatch([ALICE, BOB, CAROL]).cards).toHaveLength(3);
    expect(createMatch([ALICE, BOB, CAROL, DAVE]).cards).toHaveLength(4);
  });

  it("does not hand the same scorecard object to two seats", () => {
    // `Array.from({ length: n }, () => EMPTY)` and `new Array(n).fill(EMPTY)`
    // both satisfy every count assertion above while giving every seat ONE
    // shared card — scoring for one seat would then score for all of them. The
    // defect is invisible until a box is filled, which is several slices away,
    // so it is pinned here where it is created.
    const state = createMatch([ALICE, BOB, CAROL]);

    expect(state.cards[0]).not.toBe(state.cards[1]);
    expect(state.cards[1]).not.toBe(state.cards[2]);
    expect(state.cards[0]).not.toBe(state.cards[2]);
  });

  it("opens the match awaiting a roll nobody has to ask for", () => {
    // Spec Domain B: a new match begins in `awaiting-roll` so the room's first
    // `advance()` deals the opening roll, the way `mahjong-solitaire-module`
    // lays its board. Five null slots ARE the entropy budget for that roll —
    // D1 keeps the count structural instead of arithmetic.
    const state = createMatch([ALICE, BOB]);

    expect(state.turn).toEqual({ phase: "awaiting-roll", seat: 0, rollsUsed: 0, slots: [null, null, null, null, null] });
  });

  it("copies the seat list instead of keeping the caller's array", () => {
    // `layBoard`'s second reason for being a function rather than an object
    // literal: a caller that keeps its array and writes to it later would be
    // writing into a `readonly` state.
    const seats = [ALICE, BOB];
    const state = createMatch(seats);

    seats.push(CAROL);

    expect(state.players).toEqual([ALICE, BOB]);
    expect(state.cards).toHaveLength(2);
  });

  it("refuses a table with nobody at it", () => {
    // The opening turn names seat 0. With no seats there is no seat 0, so the
    // state would be structurally invalid the moment it was built — the same
    // class of nonsense `layBoard`'s length check refuses, and the reason both
    // are functions rather than literals.
    expect(() => createMatch([])).toThrow(/at least one seat/i);
  });
});

describe("the state carries no derived fact", () => {
  it("stores no total, no winner, no match-over flag and no doble unlock", () => {
    // Built by `createMatch`, NOT by a literal in this file, and the difference
    // is the whole test — `board.test.ts:144-152` measured that lesson: a key
    // assertion over a state the test assembled can only read back what the
    // test put there, and is green against any production code at all.
    //
    // D2's table, asserted rather than described: per-seat total, match over,
    // winner, servida and "doble unlocked" are all DERIVED, so none of them may
    // appear here. The one fact with no other trace — a generala servida win —
    // lives in the turn union as `phase: "servida-win"`, never as a sibling
    // boolean that could disagree with the phase beside it.
    const restored = JSON.parse(JSON.stringify(createMatch([ALICE, BOB]))) as MatchState;

    expect(Object.keys(restored).sort()).toEqual(["cards", "players", "turn"]);
    expect(Object.keys(restored.turn).sort()).toEqual(["phase", "rollsUsed", "seat", "slots"]);
    expect(Object.keys(restored.cards[0]!).sort()).toEqual([...CATEGORY_IDS].sort());
  });
});
