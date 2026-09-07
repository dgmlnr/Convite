import { describe, expect, it } from "vitest";

import type { DieFace } from "./dice.js";
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
    // The hold actions are the NEXT slice's work; the invariant this slice owes
    // the transport is that `deciding` is never empty, and that is the score
    // list. See the file docstring in `legal-actions.ts`.
    const state = decidingAfterOpeningRoll([ALICE, BOB]);

    const actions = getLegalActions(state, ALICE);

    expect(actions).toEqual(CATEGORY_IDS.map((category) => ({ type: "score", playerId: ALICE, category })));
  });

  it("stops offering a box once it is filled, including one crossed out at zero", () => {
    // A filled box never reopens — and "filled at 0" is filled. Crossing out is
    // exactly this: a score at a box that evaluates to nothing.
    const state = withFilledBoxes(decidingAfterOpeningRoll([ALICE, BOB]), 0, { ones: 3, full: 0, generala: 50 });

    const offered = getLegalActions(state, ALICE).map((action) => (action.type === "score" ? action.category : null));

    expect(offered).toEqual(CATEGORY_IDS.filter((category) => !["ones", "full", "generala"].includes(category)));
    expect(offered).toHaveLength(8);
  });

  it("offers the seats that are not on turn nothing", () => {
    // `deciding` belongs to one seat. Every other seat is in the same position
    // it is in during `awaiting-roll`: it has no move at all.
    const state = decidingAfterOpeningRoll([ALICE, BOB, CAROL]);

    expect(getLegalActions(state, ALICE)).toHaveLength(CATEGORY_IDS.length);
    expect(getLegalActions(state, BOB)).toEqual([]);
    expect(getLegalActions(state, CAROL)).toEqual([]);
  });

  it("offers an id that is not seated at this table nothing", () => {
    const state = decidingAfterOpeningRoll([ALICE, BOB]);

    expect(getLegalActions(state, STRANGER)).toEqual([]);
  });
});
