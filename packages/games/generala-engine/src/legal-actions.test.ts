import { describe, expect, it } from "vitest";

import type { Dice, DieFace } from "./dice.js";
import type { PlayerId } from "./ids.js";
import { CROSSING_ORDER, getLegalActions } from "./legal-actions.js";
import { applyScore } from "./play.js";
import { applyRoll } from "./roll.js";
import { scoreFor } from "./scoring.js";
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
  it("offers the acting seat every box worth something, plus the one box it may cross", () => {
    // TRIANGULATION FOR THE PROPERTY ABOVE, and it is not optional: an offer
    // list that returned `[]` for everything would satisfy "awaiting-roll is
    // empty" without the production code ever deciding anything. This is the
    // case that makes the emptiness mean something.
    //
    // The invariant this list owes the transport is that `deciding` is never
    // empty, and the score list is what guarantees it: the holds run out after
    // the third roll and the crossable box does not.
    //
    // `[3,1,4,1,5]` pays in four boxes; the other seven are worth nothing and
    // only the top of the crossing ladder is offered of them (ruleset §Orden
    // obligatorio de tachado).
    const state = decidingAfterOpeningRoll([ALICE, BOB]);

    const actions = getLegalActions(state, ALICE);

    expect(actions.filter((action) => action.type === "score")).toEqual(
      (["ones", "threes", "fours", "fives", "generala-doble"] as const).map((category) => ({ type: "score", playerId: ALICE, category })),
    );
  });

  it("stops offering a box once it is filled, including one crossed out at zero", () => {
    // A filled box never reopens — and "filled at 0" is filled. Crossing out is
    // exactly this: a score at a box that evaluates to nothing.
    const state = withFilledBoxes(decidingAfterOpeningRoll([ALICE, BOB]), 0, { ones: 3, full: 0, generala: 50 });

    const offered = getLegalActions(state, ALICE).flatMap((action) => (action.type === "score" ? [action.category] : []));

    // `ones` is gone because it is filled, not because of the ladder. Of the
    // boxes still worth nothing the ladder has moved down to `generala-doble`,
    // which is where it already was: `full` and `generala` were below it.
    expect(offered).toEqual(["threes", "fours", "fives", "generala-doble"]);
    for (const category of ["ones", "full", "generala"] as const) expect(offered).not.toContain(category);
  });

  it("offers the seats that are not on turn nothing", () => {
    // `deciding` belongs to one seat. Every other seat is in the same position
    // it is in during `awaiting-roll`: it has no move at all.
    const state = decidingAfterOpeningRoll([ALICE, BOB, CAROL]);

    expect(getLegalActions(state, ALICE)).toHaveLength(HOLD_SURFACE + 5);
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
    // transport's advance loop rests on. `[1,2,3,4,5]` pays in six boxes —
    // five upper ones and the escalera — and the seventh is the one box the
    // ladder lets a seat cross.
    expect(spent).toHaveLength(7);
  });
});

/**
 * ruleset §Orden obligatorio de tachado — the house rule added on 2026-09-09:
 * "Escribir un CERO (tachar): sólo permitido en la casilla abierta de mayor
 * pago", down the fixed ladder `Generala doble → Generala → Póker → Full →
 * Escalera → 6 → 5 → 4 → 3 → 2 → 1`. Writing a value GREATER than zero stays
 * free in any open box, so exactly one thing narrows: where a seat may spend a
 * turn on nothing. WHEN to cross is still the player's choice; WHICH box is not.
 */
describe("getLegalActions — a zero only goes in the highest-paying open box", () => {
  /** The boxes this seat is offered, in the order the list emits them. */
  function offeredBoxes(state: MatchState, playerId: PlayerId): readonly CategoryId[] {
    return getLegalActions(state, playerId).flatMap((action) => (action.type === "score" ? [action.category] : []));
  }

  it("names all eleven boxes on the ladder, exactly once each", () => {
    // A box missing from the ladder would never be the crossable one, so a
    // card whose every other box was spent would offer no zero at all — the
    // turn could not be ended and the match would strand. That is why this is
    // a fence and not a tidiness assertion.
    expect([...CROSSING_ORDER].sort()).toEqual([...CATEGORY_IDS].sort());
    expect(new Set(CROSSING_ORDER).size).toBe(CATEGORY_IDS.length);
    expect(CROSSING_ORDER[0]).toBe("generala-doble");
    expect(CROSSING_ORDER[CROSSING_ORDER.length - 1]).toBe("ones");
  });

  it("offers every box that pays something, and of the rest only the top of the ladder", () => {
    // `[4,4,6,3,2]` pays in four boxes and nothing in the other seven. Every
    // box worth something is offered wherever it sits; of the seven worth
    // nothing only `generala-doble` is, because it is the highest-paying box
    // still open.
    const state = deciding([ALICE, BOB], [4, 4, 6, 3, 2], 2, 0);

    expect(offeredBoxes(state, ALICE)).toEqual(["twos", "threes", "fours", "sixes", "generala-doble"]);
    for (const category of ["ones", "fives", "escalera", "full", "poker", "generala"] as const) {
      expect(scoreFor(category, [4, 4, 6, 3, 2], 2, state.cards[0]!), `${category} has to be worth nothing for this case to say anything`).toBe(0);
    }
  });

  it("orders by WHAT A BOX PAYS and not by what a seat minds losing least — the two disagree after the first rung", () => {
    // THE FIXTURE WHERE THE TWO READINGS COME APART, which is the only kind
    // that proves which one is implemented. With the doble already spent, the
    // payout ladder reaches `generala`; the bot's `SACRIFICE_ORDER` — ordered
    // by what a box COSTS to give up — would reach `ones`, because a single
    // ace is the cheapest thing on the card to renounce. They agree on the
    // first rung (`generala-doble`) and on nothing after it, and the ruleset
    // now says that divergence is deliberate.
    const state = withFilledBoxes(deciding([ALICE, BOB], [4, 4, 6, 3, 2], 2, 0), 0, { "generala-doble": 0 });

    const offered = offeredBoxes(state, ALICE);
    expect(offered).toContain("generala");
    expect(offered).not.toContain("ones");
    expect(offered).toEqual(["twos", "threes", "fours", "sixes", "generala"]);
  });

  it("makes the DEAREST upper box the crossable one once the lower half is spent", () => {
    // The ladder runs 6 → 5 → 4 → 3 → 2 → 1 through the upper section, so the
    // box a seat gives up last is the six — the highest-paying upper box and
    // the one most likely to pay something on any throw. The cheap boxes can
    // only be dumped at the very end, which is the whole point of the rule.
    const state = withFilledBoxes(deciding([ALICE, BOB], [1, 1, 2, 2, 3], 2, 0), 0, { escalera: 0, full: 0, poker: 0, generala: 0, "generala-doble": 0 });

    expect(offeredBoxes(state, ALICE)).toEqual(["ones", "twos", "threes", "sixes"]);
  });

  it("always offers the highest open box, so a turn can always be ended and a match always terminates", () => {
    // THE TERMINATION PROOF, played rather than argued. A rule that can strand
    // a match is unshippable, and the guarantee is exactly this: the crossable
    // box is open by construction, and an open box is always a legal target —
    // for its own value if it has one, and for a zero if it has not.
    //
    // The driver writes NOTHING BUT the crossable box, which is the worst a
    // seat can do and the only policy that walks the whole ladder. If the
    // ladder were skippable, or if a rung could go missing, this loop would
    // either be refused or never finish.
    let state = createMatch([ALICE, BOB]);
    const written: readonly CategoryId[][] = [[], []];

    for (let turn = 0; turn < 22; turn += 1) {
      const thrown = applyRoll(state, [6, 6, 6, 2, 1]);
      if (!thrown.ok) throw new Error(`the throw was refused: ${thrown.violation.code}`);
      const rolled = thrown.state;
      const current = rolled.turn;
      if (current.phase !== "deciding") throw new Error(`expected to be deciding, and the turn is ${current.phase}`);
      const card = rolled.cards[current.seat]!;
      const highest = CROSSING_ORDER.find((category) => card[category] === null);
      if (highest === undefined) throw new Error("the seat on turn has no open box, so this match is already over");

      // At every roll counter, not only the one the driver happens to be on.
      for (const rollsUsed of [1, 2, 3]) {
        const offered = offeredBoxes({ ...rolled, turn: { ...current, rollsUsed } }, rolled.players[current.seat]!);
        expect(offered.length).toBeGreaterThanOrEqual(1);
        expect(offered).toContain(highest);
      }

      const scored = applyScore(rolled, { type: "score", playerId: rolled.players[current.seat]!, category: highest });
      if (!scored.ok) throw new Error(`writing the highest open box was refused: ${scored.violation.code}`);
      written[current.seat]!.push(highest);
      state = scored.state;
    }

    // Both cards filled top-down in ladder order, which is the ladder itself
    // read back off a match instead of off the constant.
    expect(written[0]).toEqual(CROSSING_ORDER);
    expect(written[1]).toEqual(CROSSING_ORDER);
    expect(state.cards.every((card) => CATEGORY_IDS.every((category) => card[category] !== null))).toBe(true);
  });
});
