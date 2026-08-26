import { describe, expect, it } from "vitest";
import type { PlayerId } from "./ids.js";
import { createHeadToHeadMatch, createTeamMatch, startHand } from "./match.js";
import type { MatchState } from "./match.js";
import { applyAction, getLegalActions } from "./truco-chain.js";
import type { Action } from "./truco-chain.js";

/**
 * WHO MAY OPEN AN ENVIDO — the pie of each team, and only in turn.
 *
 * This is a HOUSE RULE, chosen deliberately, and the reason this file exists
 * rather than a comment is that three published rulebooks disagree about it.
 * Dealt from seat 0 a 2v2 plays 1, 2, 3, 0:
 *
 *   - one published rulebook — the right
 *     a cantarlo serán los pie de cada equipo (3v3 o 2v2) ... en el 1v1
 *     cualquiera puede cantarlo": seats 2 and 3. THIS IS WHAT CONVITE PLAYS.
 *   - another published rulebook — the two seats immediately left of
 *     quien repartió": seats 1 and 2. The exact complement of the seats
 *     the first one withholds it from.
 *   - a third published rulebook — "cada jugador en su turno tiene esas
 *     tres opciones hasta que juega una carta": all four. This is the most
 *     formal of the three, and it is the one Convite does NOT follow.
 *
 * So a fence, not a comment: a rule this contested will otherwise be
 * "corrected" by whoever reads the engine next against whichever rulebook
 * they happen to hold.
 *
 * THE PIE IS THE LAST SEAT OF EACH TEAM IN PLAY ORDER, which the same
 * reglamento defines even while disagreeing about the right: "Pie: Último
 * jugador de cada bando; suele actuar como capitán y estratega del equipo."
 * Reading around the table from the mano, the last two seats ARE one pie
 * each, because the seats alternate teams — which is why the engine needs no
 * team bookkeeping to find them, and why 1v1 needs no special case: with two
 * seats, "the last two" is everybody, exactly as that variant says.
 *
 * IN TURN, STILL. The pie rule restricts WHO, not WHEN, so the floor gate
 * stays: the mano speaks first and the right moves as each seat plays. The
 * visible consequence in 2v2 is that an envido cannot be opened before two
 * cards are down -- the first seat that may open it is the third to speak.
 * That is the cost of this variant, not a bug in it.
 */

const SELF = "pie-self" as PlayerId;
const RIGHT = "pie-right" as PlayerId;
const PARTNER = "pie-partner" as PlayerId;
const LEFT = "pie-left" as PlayerId;

/** Seat order 0..3; dealer 0 makes seat 1 the mano, so play runs 1, 2, 3, 0. */
const SEATS = [SELF, RIGHT, PARTNER, LEFT] as const;

function teamHand(): MatchState {
  return startHand(createTeamMatch({ seatOrder: [...SEATS], pointsToWin: 30, dealerSeat: 0 }), [
    [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }, { suit: "oro", rank: 3 }],
    [{ suit: "basto", rank: 5 }, { suit: "copa", rank: 10 }, { suit: "oro", rank: 2 }],
    [{ suit: "copa", rank: 4 }, { suit: "copa", rank: 5 }, { suit: "basto", rank: 2 }],
    [{ suit: "oro", rank: 6 }, { suit: "oro", rank: 7 }, { suit: "basto", rank: 3 }],
  ]);
}

function apply(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`expected legal action, got violation: ${result.violation}`);
  return result.state;
}

const canOpen = (state: MatchState, playerId: PlayerId): boolean =>
  getLegalActions(state, playerId).some((action) => action.type === "call-envido");

/** Plays whatever card the seat on the clock holds first, to move the floor along. */
function playOn(state: MatchState, playerId: PlayerId): MatchState {
  const card = getLegalActions(state, playerId).find((action) => action.type === "play-card");
  if (card === undefined) throw new Error(`${playerId} cannot play a card`);
  return apply(state, card);
}

describe("2v2: only a pie may open the envido", () => {
  it("the mano cannot open it, even holding the floor", () => {
    const state = teamHand();
    // The mano IS on the clock — this is the pie rule biting, not a turn gate.
    expect(getLegalActions(state, RIGHT).some((action) => action.type === "play-card")).toBe(true);
    expect(canOpen(state, RIGHT)).toBe(false);
  });

  it("the mano's partner — the pie of that team — opens it when the floor reaches them", () => {
    let state = teamHand();
    expect(canOpen(state, LEFT)).toBe(false); // not their turn yet
    state = playOn(state, RIGHT);
    state = playOn(state, PARTNER);
    expect(canOpen(state, LEFT)).toBe(true);
  });

  it("the dealer — the pie of the other team — opens it when the floor reaches them", () => {
    let state = teamHand();
    state = playOn(state, RIGHT);
    expect(canOpen(state, PARTNER)).toBe(false); // seat 2 is not a pie
    state = playOn(state, PARTNER);
    state = playOn(state, LEFT);
    expect(canOpen(state, SELF)).toBe(true);
  });

  it("a non-pie never gets it, at any point in the first trick", () => {
    let state = teamHand();
    for (const onTheClock of [RIGHT, PARTNER, LEFT] as const) {
      expect(canOpen(state, RIGHT), "the mano is not a pie").toBe(false);
      expect(canOpen(state, PARTNER), "the seat after the mano is not a pie").toBe(false);
      state = playOn(state, onTheClock);
    }
  });

  it("answering a truco with 'el envido está primero' is a pie's right too", () => {
    // The reply branch is not turn-gated -- a pending call freezes the floor --
    // so without the pie gate ahead of it, a non-pie would recover the call
    // the rule just took away simply by waiting to be trucked.
    const state = apply(teamHand(), { type: "call-truco", playerId: RIGHT, level: "truco" });
    expect(canOpen(state, PARTNER), "seat 2 owes the answer but is not a pie").toBe(false);
    expect(canOpen(state, SELF), "the dealer owes the answer and IS a pie").toBe(true);
  });

  it("escalating an envido already on the table stays the whole team's", () => {
    // Deliberately NOT pie-scoped: raising is answering a call that is already
    // standing, which the engine models as a team right everywhere else.
    let state = teamHand();
    state = playOn(state, RIGHT);
    state = playOn(state, PARTNER);
    state = apply(state, { type: "call-envido", playerId: LEFT, level: "envido" });
    // PARTNER is seat 2: on the team that owes the answer, and NOT a pie.
    expect(getLegalActions(state, PARTNER).some((action) => action.type === "call-envido" && action.level === "realEnvido")).toBe(true);
  });
});

describe("1v1: anybody may open it", () => {
  it("the mano opens it holding the floor", () => {
    // With two seats, "the last two in play order" is the whole table, so the
    // pie gate is vacuously true and only the floor gate is left.
    const state = startHand(createHeadToHeadMatch({ playerAId: SELF, playerBId: RIGHT, pointsToWin: 30, dealerSeat: 0 }), [
      [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }, { suit: "oro", rank: 3 }],
      [{ suit: "basto", rank: 5 }, { suit: "copa", rank: 10 }, { suit: "oro", rank: 2 }],
    ]);
    expect(canOpen(state, RIGHT), "the mano").toBe(true);
    expect(canOpen(state, SELF), "not their turn yet").toBe(false);
  });
});
