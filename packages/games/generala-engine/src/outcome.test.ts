import { describe, expect, it } from "vitest";

import type { DieFace } from "./dice.js";
import type { PlayerId } from "./ids.js";
import { getLegalActions } from "./legal-actions.js";
import { getOutcome, totalFor } from "./outcome.js";
import { applyScore } from "./play.js";
import { applyRoll } from "./roll.js";
import { CATEGORY_IDS, createMatch } from "./state.js";
import type { MatchState, Scorecard } from "./state.js";
import type { ApplyResult } from "./violation.js";

const ALICE = "player-0" as PlayerId;
const BOB = "player-1" as PlayerId;
const CAROL = "player-2" as PlayerId;
const DAVE = "player-3" as PlayerId;
const SEATS = [ALICE, BOB, CAROL, DAVE] as const;

const seatsOf = (count: number): readonly PlayerId[] => SEATS.slice(0, count);

type Hand = readonly [DieFace, DieFace, DieFace, DieFace, DieFace];

/**
 * Hands that are never five of a kind, so no throw in this file ends a match by
 * servida unless the test asked for one. `HIGH` and `LOW` differ enough that a
 * seat handed one out-totals a seat handed the other; `LEVEL` is the same hand
 * for everybody, which is how a tie is produced through the real reducers
 * rather than assembled by writing equal numbers onto two cards.
 */
const HIGH: Hand = [6, 6, 6, 6, 2];
const LOW: Hand = [1, 1, 1, 1, 2];
const LEVEL: Hand = [6, 6, 6, 2, 1];

function accepted(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`expected the action to be accepted, and it was refused: ${result.violation.code} — ${result.violation.message}`);
  return result.state;
}

const isCardFull = (card: Scorecard): boolean => CATEGORY_IDS.every((category) => card[category] !== null);

/**
 * Every key anywhere in a serialized value, however deeply nested.
 *
 * A top-level key assertion cannot see a `winner` parked inside `turn` or a
 * `total` parked on a scorecard, and "derived, never stored" is a claim about
 * the WHOLE state rather than about its first level.
 */
function everyKeyIn(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(everyKeyIn);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...everyKeyIn(nested)]);
}

/**
 * Play a match through the real reducers — throw once, write the first box the
 * ENGINE offers, hand the turn on — until it ends or `stopAfter` turns.
 *
 * THE LOOP IS BOUNDED BY THE CLAIM IT IS TESTING and that is deliberate: an
 * engine that never reached a terminal outcome would make this RETURN with too
 * many turns played, reddening an assertion, instead of stalling the suite the
 * way an unbounded `while` would. Same reason task 1.5's ceiling scenario
 * carries an explicit per-test timeout.
 *
 * The box comes from `getLegalActions` rather than from `CATEGORY_IDS`, so a
 * box the engine refuses to offer is a box this driver cannot write.
 */
function playMatch(seats: readonly PlayerId[], handFor: (seat: number) => Hand, stopAfter = seats.length * CATEGORY_IDS.length + 1): MatchState {
  let state = createMatch(seats);

  for (let turnIndex = 0; getOutcome(state) === null && turnIndex < stopAfter; turnIndex += 1) {
    const opening = state.turn;
    if (opening.phase !== "awaiting-roll") throw new Error(`a turn opens awaiting a roll, and this one is ${opening.phase}`);
    const playerId = state.players[opening.seat]!;

    state = accepted(applyRoll(state, handFor(opening.seat)));
    const open = getLegalActions(state, playerId).flatMap((action) => (action.type === "score" ? [action.category] : []));
    expect(open.length, `turn ${String(turnIndex)}: a deciding turn must offer at least one box, or the match can never end`).toBeGreaterThanOrEqual(1);
    state = accepted(applyScore(state, { type: "score", playerId, category: open[0]! }));
  }

  return state;
}

const level = (): Hand => LEVEL;

describe("the match is over when every card is full, and no field says so", () => {
  it("is still going while a single box anywhere is still open", () => {
    // Twenty-two turns fill two cards. After twenty-one, seat 0's card is full
    // and seat 1's has one box left — the state a `getOutcome` that asked "is
    // ANY card full" instead of "is EVERY card full" would already call over.
    expect(getOutcome(createMatch([ALICE, BOB]))).toBeNull();

    const oneBoxLeft = playMatch([ALICE, BOB], level, 21);

    expect(oneBoxLeft.cards.filter(isCardFull)).toHaveLength(1);
    expect(getOutcome(oneBoxLeft)).toBeNull();
  });

  it("ends the moment the last box on the last card is written", () => {
    const finished = playMatch([ALICE, BOB], level);

    expect(finished.cards.every(isCardFull)).toBe(true);
    expect(getOutcome(finished)).not.toBeNull();
  });

  it("stores nothing that says who won, that anybody won, or what anybody scored", () => {
    // Spec Domain C: the winner is "derived from the scorecards and never
    // stored". `state.test.ts` asserts this over a FRESH state; the state that
    // could actually have grown a winner field is this one, and it is built by
    // the real reducers rather than assembled — `board.test.ts:144-152`'s
    // measured lesson is that a key assertion over a state the test built can
    // only read back what the test put there.
    const finished = playMatch([ALICE, BOB], level);
    const restored = JSON.parse(JSON.stringify(finished)) as MatchState;

    expect(getOutcome(restored)).toEqual(getOutcome(finished));
    expect(new Set(everyKeyIn(restored))).toEqual(new Set(["players", "cards", "turn", "phase", "seat", "rollsUsed", "slots", ...CATEGORY_IDS]));
  });

  it("names the seat with the higher total as the sole winner", () => {
    const finished = playMatch([ALICE, BOB], (seat) => (seat === 0 ? HIGH : LOW));
    const totals = finished.cards.map(totalFor);

    expect(totals[0]!).toBeGreaterThan(totals[1]!);
    expect(getOutcome(finished)).toEqual({ winnerIds: [ALICE] });
  });

  it("names the higher seat when it is the higher seat that scored more", () => {
    // The same match with the hands swapped. Without it, a `getOutcome` that
    // always answered "seat 0" would pass the case above, and seat order would
    // be deciding the match while looking like an argmax.
    const finished = playMatch([ALICE, BOB], (seat) => (seat === 0 ? LOW : HIGH));

    expect(getOutcome(finished)).toEqual({ winnerIds: [BOB] });
  });
});

describe("a generala servida ends the match before anything is written", () => {
  it("names the seat that rolled it, on a table where nobody has scored anything", () => {
    // The `servida-win` arm is the ONE terminal fact that is state (D2), and it
    // is terminal with every card still empty and every total still 0 — so a
    // `getOutcome` that only ever ran the argmax over full cards answers null
    // here and reds. The win is not a scoring event: no box is written.
    const won = accepted(applyRoll(createMatch([ALICE, BOB]), [3, 3, 3, 3, 3]));

    expect(won.turn.phase).toBe("servida-win");
    expect(won.cards.map(totalFor)).toEqual([0, 0]);
    expect(getOutcome(won)).toEqual({ winnerIds: [ALICE] });
  });

  it("names the seat that rolled it rather than seat 0", () => {
    const seatOneOnTurn = playMatch([ALICE, BOB], level, 1);
    const won = accepted(applyRoll(seatOneOnTurn, [2, 2, 2, 2, 2]));

    expect(getOutcome(won)).toEqual({ winnerIds: [BOB] });
  });

  it("is terminal even though nine boxes on every card are still open", () => {
    // Reading the outcome off the cards first and the phase second answers
    // `null` here, and the transport's loop would keep asking for rolls after a
    // match the ruleset says is already over. The order of the two checks is
    // the rule, not a preference.
    const won = accepted(applyRoll(playMatch([ALICE, BOB], level, 2), [5, 5, 5, 5, 5]));

    expect(won.cards.every(isCardFull)).toBe(false);
    expect(getOutcome(won)).toEqual({ winnerIds: [ALICE] });
  });
});

describe("every seat tied at the highest total is reported as a winner", () => {
  it("reports BOTH seats when two finish level, because an empty list already means nobody won", () => {
    // O-2, CLOSED BY THE PRODUCT OWNER, and Generala is the first game in this
    // repo where a scoring tie is possible at all — so this is the precedent
    // the next one copies.
    //
    // `MatchOutcome`'s own docstring says `winnerIds` MAY be empty, which
    // PERMITS rather than requires. The two places that return an empty list
    // today both mean nobody won at all: a board lost or abandoned
    // (`mahjong-solitaire-engine/src/board.ts:123`) and a match with no winning
    // team (`escoba-module/src/index.ts:132`). A tie at the top is not that; it
    // is two players who each won. Reported as empty it would reach
    // `escoba-ui/src/match-outcome.ts:59`, which renders an empty list as the
    // neutral "Partida finalizada" — telling two winners that nothing happened.
    // A multi-id list is already an ordinary shape here: escoba returns a whole
    // team's `playerIds`.
    const finished = playMatch([ALICE, BOB], level);
    const totals = finished.cards.map(totalFor);

    expect(totals[0]!).toBe(totals[1]!);
    expect(getOutcome(finished)).toEqual({ winnerIds: [ALICE, BOB] });
  });

  it("reports all three when three finish level", () => {
    const finished = playMatch(seatsOf(3), level);

    expect(new Set(finished.cards.map(totalFor)).size).toBe(1);
    expect(getOutcome(finished)).toEqual({ winnerIds: [ALICE, BOB, CAROL] });
  });

  it("reports the tied seats only, never the whole table", () => {
    // The case that separates "the full argmax set" from "everybody, whenever
    // the top is shared": seats 0 and 2 tie at the top and seat 1 is behind
    // them. An implementation returning every seat passes both cases above.
    const finished = playMatch(seatsOf(3), (seat) => (seat === 1 ? LOW : HIGH));
    const totals = finished.cards.map(totalFor);

    expect(totals[0]!).toBe(totals[2]!);
    expect(totals[1]!).toBeLessThan(totals[0]!);
    expect(getOutcome(finished)).toEqual({ winnerIds: [ALICE, CAROL] });
  });

  it("reports the winners in seat order", () => {
    // `winnerIds` is read by a UI that lists names. Seat order is the one order
    // this engine has, and an order derived from the totals would be unstable
    // for exactly the seats that tie.
    expect(getOutcome(playMatch(seatsOf(4), level))?.winnerIds).toEqual(seatsOf(4));
  });
});

describe("a total is the plain sum of the boxes that are written", () => {
  it("counts an untouched card as nothing", () => {
    expect(totalFor(createMatch([ALICE]).cards[0]!)).toBe(0);
  });

  it("counts an open box as nothing rather than making the sum unanswerable", () => {
    // The scorecard shows a running total mid-match, so this has to be total
    // over a partly filled card — and `null` reaching an arithmetic sum gives
    // `NaN`, which every comparison downstream silently swallows instead of
    // refusing.
    const midMatch = playMatch([ALICE, BOB], level, 3);

    expect(Number.isFinite(totalFor(midMatch.cards[0]!))).toBe(true);
    expect(totalFor(midMatch.cards[0]!)).toBeGreaterThan(0);
  });

  it("adds no end-of-match bonus to a full card", () => {
    // Spec Domain C: "Match totals MUST be a plain sum of the filled boxes —
    // there is no end-of-match bonus." Compared against the arithmetic done
    // here rather than against a number copied out of a run, so a bonus of any
    // size reds it.
    const card = playMatch([ALICE, BOB], level).cards[0]!;
    const byHand = CATEGORY_IDS.reduce((sum, category) => sum + (card[category] ?? 0), 0);

    expect(isCardFull(card)).toBe(true);
    expect(totalFor(card)).toBe(byHand);
  });
});
