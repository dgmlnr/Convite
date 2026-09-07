import { describe, expect, it } from "vitest";

import type { DieFace } from "./dice.js";
import type { PlayerId } from "./ids.js";
import { getLegalActions } from "./legal-actions.js";
import { getOutcome } from "./outcome.js";
import { applyScore } from "./play.js";
import { applyRoll } from "./roll.js";
import { CATEGORY_IDS, createMatch } from "./state.js";
import type { MatchState } from "./state.js";
import { getViewFor } from "./view.js";
import type { ApplyResult } from "./violation.js";

const ALICE = "player-0" as PlayerId;
const BOB = "player-1" as PlayerId;
const CAROL = "player-2" as PlayerId;
const STRANGER = "nobody-at-this-table" as PlayerId;

/** Four sixes and a fifth — never five of a kind, so nothing here wins by servida unless asked. */
const PLAIN = [6, 6, 6, 2, 1] as readonly [DieFace, DieFace, DieFace, DieFace, DieFace];

function accepted(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`expected the action to be accepted, and it was refused: ${result.violation.code} — ${result.violation.message}`);
  return result.state;
}

/** Play whole turns through the real reducers: throw, write the first box the engine offers. */
function playTurns(state: MatchState, turns: number): MatchState {
  let current = state;
  for (let played = 0; played < turns; played += 1) {
    const rolled = accepted(applyRoll(current, PLAIN));
    const turn = rolled.turn;
    if (turn.phase !== "deciding") throw new Error(`expected to be deciding after the throw, and the turn is ${turn.phase}`);
    const playerId = rolled.players[turn.seat]!;
    const open = getLegalActions(rolled, playerId).flatMap((action) => (action.type === "score" ? [action.category] : []));
    current = accepted(applyScore(rolled, { type: "score", playerId, category: open[0]! }));
  }
  return current;
}

/**
 * Every key anywhere in a serialized value, however deeply nested — the same
 * scan `outcome.test.ts` uses on the state, pointed at the view instead.
 */
function everyKeyIn(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(everyKeyIn);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...everyKeyIn(nested)]);
}

/**
 * States a PRODUCER built, never a literal assembled here.
 *
 * `board.test.ts:144-152`'s measured lesson, and D6 asks for it by name: a key
 * assertion over a state the test put together can only read back what the test
 * put there, and is green against any production code at all.
 */
const THREE_SEATS = [ALICE, BOB, CAROL] as const;
const FRESH = createMatch(THREE_SEATS);
const DECIDING = accepted(applyRoll(FRESH, PLAIN));
const MID_MATCH = accepted(applyRoll(playTurns(FRESH, 4), PLAIN));
const FINISHED = playTurns(FRESH, 33);
const SERVIDA_WIN = accepted(applyRoll(FRESH, [3, 3, 3, 3, 3]));

describe("every seat sees the same table", () => {
  it("[PROPERTY] gives every seat a structurally equal turn, cards, totals and outcome", () => {
    // D6, and this is the test that BREAKS the day a field becomes secret: a
    // redacted field is by definition not equal across seats, so the moment
    // Generala grows something one seat may see and another may not, this reds.
    // Escoba is the contrast — its `stock` becomes a `stockCount` because its
    // state structurally contains cards nobody has seen. Generala's does not:
    // the cards are public per proposal Q4, the faces are physically showing,
    // and the roll counter is something everybody at the table counts.
    const states: readonly { readonly name: string; readonly state: MatchState }[] = [
      { name: "fresh", state: FRESH },
      { name: "deciding", state: DECIDING },
      { name: "mid-match", state: MID_MATCH },
      { name: "finished", state: FINISHED },
      { name: "won by servida", state: SERVIDA_WIN },
    ];
    let compared = 0;

    for (const { name, state } of states) {
      const [first, ...rest] = state.players.map((playerId) => getViewFor(state, playerId));
      for (const other of rest) {
        expect(other.turn, `${name}: turn`).toEqual(first!.turn);
        expect(other.cards, `${name}: cards`).toEqual(first!.cards);
        expect(other.totals, `${name}: totals`).toEqual(first!.totals);
        expect(other.outcome, `${name}: outcome`).toEqual(first!.outcome);
        compared += 1;
      }
    }

    // The loops are only worth something if they ran: five states, three seats,
    // two comparisons each.
    expect(compared).toBe(10);
  });

  it("re-keys the seats without losing one, duplicating one or renumbering one", () => {
    // `self` and `others` are the only per-seat difference there is, and they
    // are a RE-KEY rather than a filter of anything: put back together they are
    // the whole table, in seat order, once each.
    for (const playerId of THREE_SEATS) {
      const view = getViewFor(MID_MATCH, playerId);
      const wholeTable = [view.self, ...view.others].sort((left, right) => left.seat - right.seat);

      expect(view.self.playerId).toBe(playerId);
      expect(view.others.map((other) => other.playerId)).not.toContain(playerId);
      expect(wholeTable).toEqual([
        { playerId: ALICE, seat: 0 },
        { playerId: BOB, seat: 1 },
        { playerId: CAROL, seat: 2 },
      ]);
    }
  });
});

describe("the view is a projection, not a redaction", () => {
  it("carries exactly the keys it declares, and no others, at every phase", () => {
    const publicTable = ["self", "playerId", "seat", "others", "cards", ...CATEGORY_IDS, "totals", "turn", "phase", "outcome"];

    expect(new Set(everyKeyIn(getViewFor(FRESH, ALICE)))).toEqual(new Set([...publicTable, "rollsUsed", "slots"]));
    expect(new Set(everyKeyIn(getViewFor(DECIDING, BOB)))).toEqual(new Set([...publicTable, "rollsUsed", "dice"]));
    expect(new Set(everyKeyIn(getViewFor(SERVIDA_WIN, CAROL)))).toEqual(new Set([...publicTable, "winnerIds"]));
    expect(new Set(everyKeyIn(getViewFor(FINISHED, ALICE)))).toEqual(new Set([...publicTable, "rollsUsed", "slots", "winnerIds"]));
  });

  it("does not carry a value the state holds and the view never names", () => {
    // `escoba-bot/src/hidden-state.test.ts`'s discipline: the leak is looked for
    // BY VALUE across the whole serialized view, never by naming the field it
    // would arrive through — so a leak through SOME OTHER field is caught too.
    //
    // Generala has nothing to hide today, which is D6's claim, so the hidden
    // thing is PLANTED: a face that has not been rolled, exactly the state
    // exploration Design C would have manufactured by pre-rolling all three
    // throws. It is planted as a sentinel STRING rather than as a `DieFace`
    // because 1 through 6 appear all over a legitimate view — in seats, in roll
    // counters, in box values — so scanning for one would prove nothing.
    //
    // A view built by spreading `MatchState` passes every key assertion above
    // and fails this.
    const secret = "unrolled-face-2c7f41";
    const withHiddenState = { ...DECIDING, pendingFaces: [secret] } as unknown as MatchState;

    expect(JSON.stringify(getViewFor(withHiddenState, ALICE))).not.toContain(secret);
  });

  it("does not carry a face added to the TURN, even though no view field names it", () => {
    // The obvious wrong implementation is not a spread of the whole state, it
    // is `turn: state.turn` — handing the turn object straight through. It
    // passes every assertion in this file except this one, and it is what makes
    // the arm-by-arm projection in `view.ts` load-bearing rather than
    // ceremonial: the day the `deciding` arm grows a field, a pass-through
    // publishes it and a projection does not.
    const secret = "pre-rolled-face-9ab30d";
    const withHiddenTurn = { ...DECIDING, turn: { ...DECIDING.turn, nextFace: secret } } as unknown as MatchState;

    expect(JSON.stringify(getViewFor(withHiddenTurn, ALICE))).not.toContain(secret);
  });

  it("does not carry a value added to a SCORECARD", () => {
    // The third pass-through, and the least obvious: `cards: state.cards` reads
    // as harmless because a scorecard is public in full. It is the boxes that
    // are public, though — not whatever a later change parks beside them.
    const secret = "hidden-per-seat-4e18b2";
    const withHiddenCard = { ...MID_MATCH, cards: MID_MATCH.cards.map((card) => ({ ...card, plannedBox: secret })) } as unknown as MatchState;

    expect(JSON.stringify(getViewFor(withHiddenCard, ALICE))).not.toContain(secret);
  });

  it("refuses a player who is not at this table", () => {
    // The same refusal `escoba-engine/src/view.ts:58-60` and
    // `truco-engine/src/view.ts:131-133` make. An unknown id resolving to seat
    // 0 would hand a stranger a view that claims to be somebody's.
    expect(() => getViewFor(MID_MATCH, STRANGER)).toThrow(/unknown player/i);
  });
});

describe("the derived facts are on the view so nothing downstream re-derives them", () => {
  it("carries each seat's running total, computed from the boxes actually written", () => {
    // Escoba's own argument for putting `HandOutcome` on its view
    // (`view.ts:32-35`): a UI reads this, it never re-derives it. Compared here
    // against arithmetic done in this file, not against `totalFor` itself, so a
    // view that called something else entirely still has to agree.
    const view = getViewFor(MID_MATCH, BOB);
    const byHand = MID_MATCH.cards.map((card) => CATEGORY_IDS.reduce((sum, category) => sum + (card[category] ?? 0), 0));

    expect(view.totals).toEqual(byHand);
    expect(view.totals.some((total) => total > 0)).toBe(true);
  });

  it("carries no outcome while the match is live, and the winners once it is not", () => {
    expect(getViewFor(MID_MATCH, ALICE).outcome).toBeNull();
    expect(getViewFor(FINISHED, ALICE).outcome).toEqual(getOutcome(FINISHED));
    expect(getViewFor(FINISHED, ALICE).outcome).toEqual({ winnerIds: [ALICE, BOB, CAROL] });
    expect(getViewFor(SERVIDA_WIN, CAROL).outcome).toEqual({ winnerIds: [ALICE] });
  });

  it("shows every seat's whole scorecard, which is what makes blocking play possible", () => {
    // Spec Domain B: "Every seat's scorecard — filled, open and crossed-at-zero
    // boxes — MUST be visible to every seat; that visibility is what makes
    // blocking play possible." Seat 2 reads seat 0's filled boxes and seat 0's
    // open ones, at the same time.
    const view = getViewFor(MID_MATCH, CAROL);

    expect(view.cards).toHaveLength(3);
    expect(view.cards).toEqual(MID_MATCH.cards);
    expect(Object.values(view.cards[0]!).filter((box) => box !== null).length).toBeGreaterThan(0);
    expect(Object.values(view.cards[0]!).filter((box) => box === null).length).toBeGreaterThan(0);
  });
});
