import { describe, expect, it } from "vitest";

import type { Dice, DieFace } from "./dice.js";
import type { PlayerId } from "./ids.js";
import { getLegalActions } from "./legal-actions.js";
import { applyRoll } from "./roll.js";
import { CATEGORY_IDS, createMatch } from "./state.js";
import type { CategoryId, MatchState, Scorecard } from "./state.js";

const ALICE = "player-0" as PlayerId;
const BOB = "player-1" as PlayerId;
const CAROL = "player-2" as PlayerId;
const DAVE = "player-3" as PlayerId;
const STRANGER = "nobody-at-this-table" as PlayerId;

/**
 * The size of the legal hold surface, written out from the spec rather than
 * read off the production constant: 2^5 subsets of the five positions, minus
 * the one that keeps all five and re-rolls nothing.
 */
const HOLD_SURFACE = 31;

function awaitingRoll(seats: readonly PlayerId[], slots: readonly (DieFace | null)[], rollsUsed: number, seat: number): MatchState {
  const base = createMatch(seats);
  return { ...base, turn: { phase: "awaiting-roll", seat, rollsUsed, slots } };
}

/** The `deciding` state a real opening roll produces — never assembled here. */
function decidingAfterOpeningRoll(seats: readonly PlayerId[]): MatchState {
  const result = applyRoll(createMatch(seats), [3, 1, 4, 1, 5]);
  if (!result.ok) throw new Error(`the opening roll was refused: ${result.violation.code}`);
  return result.state;
}

/**
 * A `deciding` turn at a chosen roll counter. Assembled rather than played out,
 * because what these cases are about is the counter itself and driving three
 * rolls to reach it would make the reducer's correctness a precondition of the
 * offer list's.
 */
function deciding(seats: readonly PlayerId[], dice: Dice, rollsUsed: number, seat: number): MatchState {
  const base = createMatch(seats);
  return { ...base, turn: { phase: "deciding", seat, rollsUsed, dice } };
}

function withFilledBoxes(state: MatchState, seat: number, filled: Partial<Record<CategoryId, number>>): MatchState {
  return {
    ...state,
    cards: state.cards.map((card, index) => (index === seat ? ({ ...card, ...filled } as Scorecard) : card)),
  };
}

describe("getLegalActions — nobody can act while the cup is shaking", () => {
  it("offers every seated player nothing, in every awaiting-roll state", () => {
    // THE PROPERTY, and it is quantified over seats on purpose. A single seat
    // retaining one action here means `anySeatCanAct` never reads false, the
    // system action is never requested, and the table sits forever — and since
    // the transport started gating on this list, it would also be offering a
    // move inside the window the transport reserves for the system itself.
    const tables: readonly MatchState[] = [
      createMatch([ALICE, BOB]), // the opening turn, straight from the producer
      awaitingRoll([ALICE, BOB], [6, 6, null, null, null], 1, 0),
      awaitingRoll([ALICE, BOB], [null, 4, null, 6, null], 2, 1),
      awaitingRoll([ALICE, BOB, CAROL, DAVE], [null, null, null, null, null], 0, 2),
      awaitingRoll([ALICE, BOB, CAROL, DAVE], [1, 2, 3, 4, null], 2, 3),
    ];

    for (const table of tables) {
      for (const seated of table.players) {
        expect(getLegalActions(table, seated)).toEqual([]);
      }
    }
    // The loops above are only worth something if they ran: five tables, and
    // fourteen seated players between them.
    expect(tables.reduce((total, table) => total + table.players.length, 0)).toBe(14);
  });

  it("offers nobody anything once a generala servida has won", () => {
    const rolled = applyRoll(createMatch([ALICE, BOB]), [3, 3, 3, 3, 3]);
    if (!rolled.ok) throw new Error("the opening roll was refused");
    expect(rolled.state.turn.phase).toBe("servida-win");

    for (const seated of rolled.state.players) {
      expect(getLegalActions(rolled.state, seated)).toEqual([]);
    }
  });
});

describe("getLegalActions — deciding is the phase that offers something", () => {
  it("offers the acting seat one score action per open box", () => {
    // TRIANGULATION FOR THE PROPERTY ABOVE, and it is not optional: an offer
    // list that returned `[]` for everything would satisfy "awaiting-roll is
    // empty" without the production code ever deciding anything. This is the
    // case that makes the emptiness mean something.
    //
    // The invariant this list owes the transport is that `deciding` is never
    // empty, and the score list is what guarantees it: the holds run out after
    // the third roll and the boxes do not.
    const state = decidingAfterOpeningRoll([ALICE, BOB]);

    const actions = getLegalActions(state, ALICE);

    expect(actions.filter((action) => action.type === "score")).toEqual(CATEGORY_IDS.map((category) => ({ type: "score", playerId: ALICE, category })));
  });

  it("stops offering a box once it is filled, including one crossed out at zero", () => {
    // A filled box never reopens — and "filled at 0" is filled. Crossing out is
    // exactly this: a score at a box that evaluates to nothing.
    const state = withFilledBoxes(decidingAfterOpeningRoll([ALICE, BOB]), 0, { ones: 3, full: 0, generala: 50 });

    const offered = getLegalActions(state, ALICE).flatMap((action) => (action.type === "score" ? [action.category] : []));

    expect(offered).toEqual(CATEGORY_IDS.filter((category) => !["ones", "full", "generala"].includes(category)));
    expect(offered).toHaveLength(8);
  });

  it("offers the seats that are not on turn nothing", () => {
    // `deciding` belongs to one seat. Every other seat is in the same position
    // it is in during `awaiting-roll`: it has no move at all.
    const state = decidingAfterOpeningRoll([ALICE, BOB, CAROL]);

    expect(getLegalActions(state, ALICE)).toHaveLength(HOLD_SURFACE + CATEGORY_IDS.length);
    expect(getLegalActions(state, BOB)).toEqual([]);
    expect(getLegalActions(state, CAROL)).toEqual([]);
  });

  it("offers an id that is not seated at this table nothing", () => {
    const state = decidingAfterOpeningRoll([ALICE, BOB]);

    expect(getLegalActions(state, STRANGER)).toEqual([]);
  });
});

describe("getLegalActions — the hold surface is 31 actions, never 32", () => {
  it("offers every subset of the five positions except the one that re-rolls nothing", () => {
    const state = decidingAfterOpeningRoll([ALICE, BOB]);

    const keeps = getLegalActions(state, ALICE).flatMap((action) => (action.type === "hold" ? [action.keep] : []));

    expect(keeps).toHaveLength(HOLD_SURFACE);
    // `keep: []` is the rulebook's explicit "re-roll all five", and it is a
    // legal move rather than a no-op.
    expect(keeps).toContainEqual([]);
    // Holding all five re-rolls nothing: it burns a roll and changes no die,
    // which is not a move a player can make at a real table either.
    expect(keeps).not.toContainEqual([0, 1, 2, 3, 4]);
    expect(new Set(keeps.map((keep) => keep.join(","))).size).toBe(HOLD_SURFACE);
    for (const keep of keeps) {
      expect(keep.length).toBeLessThanOrEqual(4);
      for (const index of keep) expect(index).toBeGreaterThanOrEqual(0);
      for (const index of keep) expect(index).toBeLessThan(5);
    }
  });

  it("emits every keep strictly ascending, which is the only order the room will accept", () => {
    // `sameAction` (`match-room.ts:256-268`) walks arrays BY INDEX, so an
    // offer of `[1,0]` and a reducer accepting `[0,1]` would describe two
    // different actions and the player could submit neither. One canonical
    // order, chosen here and enforced there, is what removes that whole class.
    const state = decidingAfterOpeningRoll([ALICE, BOB, CAROL]);

    const keeps = getLegalActions(state, ALICE).flatMap((action) => (action.type === "hold" ? [action.keep] : []));

    expect(keeps).toHaveLength(HOLD_SURFACE);
    for (const keep of keeps) {
      expect(keep).toEqual([...keep].sort((left, right) => left - right));
      expect(new Set(keep).size).toBe(keep.length);
    }
  });

  it("closes the holds after the third roll, and not one roll before", () => {
    // The off-by-one this pins in both directions: a fourth roll must be
    // unreachable, and a third must still be offered.
    const dice: Dice = [1, 2, 3, 4, 5];

    for (const rollsUsed of [1, 2]) {
      const open = getLegalActions(deciding([ALICE, BOB], dice, rollsUsed, 0), ALICE);
      expect(open.filter((action) => action.type === "hold")).toHaveLength(HOLD_SURFACE);
    }

    const spent = getLegalActions(deciding([ALICE, BOB], dice, 3, 0), ALICE);
    expect(spent.filter((action) => action.type === "hold")).toEqual([]);
    // And what is left is still not empty, which is the invariant the
    // transport's advance loop rests on.
    expect(spent).toHaveLength(CATEGORY_IDS.length);
  });
});
