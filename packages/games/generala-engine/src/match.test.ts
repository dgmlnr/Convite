import { describe, expect, it } from "vitest";

import type { DieFace } from "./dice.js";
import type { PlayerId } from "./ids.js";
import { getLegalActions } from "./legal-actions.js";
import { getOutcome, totalFor } from "./outcome.js";
import { applyHold, applyScore } from "./play.js";
import { applyRoll } from "./roll.js";
import { CATEGORY_IDS, createMatch } from "./state.js";
import type { CategoryId, MatchState, Scorecard } from "./state.js";
import type { ApplyResult } from "./violation.js";

const SEATS = ["player-0", "player-1", "player-2", "player-3"] as const;
const seatsOf = (count: number): readonly PlayerId[] => SEATS.slice(0, count).map((id) => id as PlayerId);

type Hand = readonly [DieFace, DieFace, DieFace, DieFace, DieFace];

/**
 * Four of a face and a fifth — NEVER five of a kind, so nothing in this file
 * ever ends a match by servida.
 *
 * That is what makes the doble property say something: with this hand no seat
 * can ever score the generala box at anything but zero, so no seat ever unlocks
 * the doble's 100, so every seat has to be able to cross the doble out. It is
 * exactly the match the rejected "untargetable until generala is scored"
 * reading cannot terminate.
 */
const PLAIN: Hand = [6, 6, 6, 2, 1];

function accepted(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`expected the action to be accepted, and it was refused: ${result.violation.code} — ${result.violation.message}`);
  return result.state;
}

const isCardFull = (card: Scorecard): boolean => CATEGORY_IDS.every((category) => card[category] !== null);

/** How a match is played out: what each seat throws, how often, and which box it writes. */
interface MatchPlan {
  readonly hand: (seat: number) => Hand;
  /** 1, 2 or 3 — the extra throws go through a real `hold` of nothing. */
  readonly throws: (turnIndex: number) => number;
  readonly box: (open: readonly CategoryId[], turnIndex: number) => CategoryId;
}

interface Trace {
  readonly state: MatchState;
  readonly turnsPlayed: number;
  /** The seat that played each turn, in order — the turn-advance rule, observed. */
  readonly seatOrder: readonly number[];
  /** What the engine OFFERED on each turn, never what this file assumed was open. */
  readonly openBoxesSeen: readonly (readonly CategoryId[])[];
}

/**
 * Play a whole match through the real reducers, from `createMatch` to a
 * terminal outcome, choosing only from what `getLegalActions` offers.
 *
 * THE LOOP IS BOUNDED BY THE CLAIM IT IS TESTING, and that is the whole reason
 * this file can assert termination at all: an engine that never terminated
 * would make this RETURN having played too many turns — reddening an assertion
 * — instead of stalling the suite the way an unbounded `while` would. The spec
 * requires exactly that ("MUST red this scenario rather than hang the suite"),
 * and it is the same hazard task 1.5's ceiling scenario carries a per-test
 * timeout for.
 *
 * The box comes from the OFFER LIST rather than from `CATEGORY_IDS`, which is
 * what makes the doble's targetability load-bearing here: an implementation
 * withholding the doble until generala was filled would leave a seat with an
 * unfillable box and nothing to offer, and the emptiness assertion below reds
 * on that turn rather than looping forever on it.
 */
function playWholeMatch(seats: readonly PlayerId[], plan: MatchPlan): Trace {
  const ceiling = seats.length * CATEGORY_IDS.length;
  let state = createMatch(seats);
  const seatOrder: number[] = [];
  const openBoxesSeen: (readonly CategoryId[])[] = [];

  while (getOutcome(state) === null && seatOrder.length <= ceiling) {
    const opening = state.turn;
    if (opening.phase !== "awaiting-roll") throw new Error(`a turn opens awaiting a roll, and this one is ${opening.phase}`);
    const playerId = state.players[opening.seat]!;
    const turnIndex = seatOrder.length;
    seatOrder.push(opening.seat);

    state = accepted(applyRoll(state, plan.hand(opening.seat)));
    for (let thrown = 1; thrown < plan.throws(turnIndex); thrown += 1) {
      // A hold of nothing is a legal move — the rulebook's explicit "re-roll
      // all five" — so the extra throws go through the real reducer instead of
      // being simulated by writing a counter.
      state = accepted(applyHold(state, { type: "hold", playerId, keep: [] }));
      state = accepted(applyRoll(state, plan.hand(opening.seat)));
    }

    const open = getLegalActions(state, playerId).flatMap((action) => (action.type === "score" ? [action.category] : []));
    expect(open.length, `turn ${String(turnIndex)}: a deciding turn must offer at least one box, or the match can never end`).toBeGreaterThanOrEqual(1);
    openBoxesSeen.push(open);
    state = accepted(applyScore(state, { type: "score", playerId, category: plan.box(open, turnIndex) }));
  }

  return { state, turnsPlayed: seatOrder.length, seatOrder, openBoxesSeen };
}

const plain = (): Hand => PLAIN;
const alwaysOnce = (): number => 1;
const firstOpen = (open: readonly CategoryId[]): CategoryId => open[0]!;

/** Everybody throws the same hand, throws once, and writes the first box offered. */
const PLAIN_PLAN: MatchPlan = { hand: plain, throws: alwaysOnce, box: firstOpen };

describe("termination is bounded, not hoped for", () => {
  it("[PROPERTY] reaches a terminal outcome in exactly seatCount x 11 turns, whatever legal sequence is played", () => {
    // Spec Domain C: "GIVEN any Generala match and any sequence of legal
    // actions ... THEN it reaches a terminal outcome in at most `seatCount x
    // 11` turns — because exactly one box is filled per turn and no box
    // reopens."
    //
    // Quantified over three table sizes, three box-choice policies and three
    // throw counts — 27 whole matches — so the bound is a property of the rules
    // rather than of the one sequence a single worked example happens to walk.
    // The throw policies matter as much as the box ones: a hold is a legal
    // action too, and "any sequence of legal actions" has to include the ones
    // that spend all three throws before writing anything.
    const boxPolicies: readonly { readonly name: string; readonly box: MatchPlan["box"] }[] = [
      { name: "first open", box: firstOpen },
      { name: "last open", box: (open) => open[open.length - 1]! },
      { name: "rotating", box: (open, turnIndex) => open[turnIndex % open.length]! },
    ];
    const throwPolicies: readonly { readonly name: string; readonly throws: MatchPlan["throws"] }[] = [
      { name: "score off the cup", throws: alwaysOnce },
      { name: "spend all three", throws: () => 3 },
      { name: "alternating", throws: (turnIndex) => (turnIndex % 3) + 1 },
    ];
    const turnsPlayed: number[] = [];

    for (const seatCount of [2, 3, 4]) {
      for (const boxPolicy of boxPolicies) {
        for (const throwPolicy of throwPolicies) {
          const label = `${String(seatCount)} seats, ${boxPolicy.name}, ${throwPolicy.name}`;
          const trace = playWholeMatch(seatsOf(seatCount), { hand: plain, throws: throwPolicy.throws, box: boxPolicy.box });

          expect(getOutcome(trace.state), `${label}: the match never reached a terminal outcome`).not.toBeNull();
          expect(trace.turnsPlayed, `${label}: turns played`).toBe(seatCount * CATEGORY_IDS.length);
          expect(trace.state.cards.every(isCardFull), `${label}: every card full`).toBe(true);
          turnsPlayed.push(trace.turnsPlayed);
        }
      }
    }

    // The loops are only worth something if they ran, and over the spread the
    // property claims rather than over one table size nine times.
    expect(turnsPlayed).toHaveLength(27);
    expect(new Set(turnsPlayed)).toEqual(new Set([22, 33, 44]));
  });

  it("[PROPERTY] fills every box including the doble in a match where nobody rolls five of a kind", () => {
    // Spec Domain C, the scenario that exists to keep the rejected reading OUT:
    // "an implementation that makes the doble box untargetable until generala
    // is filled leaves at least one seat with an unfillable box and no legal
    // action, which MUST red this scenario rather than hang the suite."
    //
    // #3838's literal wording — "habilitada sólo después de haber anotado la
    // primera generala" — read strictly is unterminatable, and correction C-1
    // overrode it for exactly this reason. This is that correction, executed.
    const trace = playWholeMatch(seatsOf(3), PLAIN_PLAN);

    for (const card of trace.state.cards) {
      for (const category of CATEGORY_IDS) expect(card[category], `${category} was never written`).not.toBeNull();
    }
    // Crossed out at zero on every card, which is the point: nobody ever rolled
    // five of a kind, so nobody ever unlocked the 100, and the box still had to
    // be closable.
    expect(trace.state.cards.every((card) => card["generala-doble"] === 0 && card.generala === 0)).toBe(true);
    // And the turn where the doble is the ONLY box offered is the turn an
    // untargetable doble cannot answer. Asserted to have happened rather than
    // assumed — once per seat, on its fourth turn: `[6,6,6,2,1]` pays in three
    // boxes, and once those are written every box left is worth nothing, so the
    // crossing ladder is the entire offer list from there on.
    expect(trace.openBoxesSeen.filter((open) => open.length === 1 && open[0] === "generala-doble")).toHaveLength(3);
    // Eight of each seat's eleven turns are a forced crossing, which is what
    // the ladder costs a seat that rolls nothing: 3 seats x 8.
    expect(trace.openBoxesSeen.filter((open) => open.length === 1)).toHaveLength(24);
  });
});

describe("the engine already plays more seats than are registered", () => {
  it("[PROPERTY] plays N=2, N=3 and N=4 through the same code, and everything observable is the same function of N", () => {
    // D11's fence, and spec Domain D: "an engine hard-coded to two seats passes
    // the shipped registration and fails this, which is the whole point of
    // asserting it now." `generala-module` declares `seatCount: 2`; a later
    // three- or four-seat entry must be an additive registration needing zero
    // engine change, the path `truco-module/src/index.ts:281-286` documents.
    //
    // "Identical code paths" is asserted as: every observable of a whole match
    // is the SAME FUNCTION of N, written once below and compared against every
    // table size. A branch reading `players.length === 2` anywhere — turn
    // advance, the offer list, the outcome — makes one of these diverge.
    //
    // The eleven offer lists are the sharpest of them. Every seat, at every
    // table size, is offered the same shrinking sequence of boxes, which is
    // only true if the offer list reads the ACTING seat's card by index rather
    // than a seat this engine named.
    //
    // WRITTEN OUT RATHER THAN DERIVED FROM `CATEGORY_IDS`, because since the
    // crossing ladder landed the offer list is not "every open box". Under
    // `[6,6,6,2,1]` exactly three boxes are ever worth anything, and the policy
    // takes them first; from the fourth turn on every box left is worth nothing
    // and the ladder IS the offer list, one rung a turn (ruleset §Orden
    // obligatorio de tachado).
    const offersEverySeatShouldSee: readonly (readonly CategoryId[])[] = [
      ["ones", "twos", "sixes", "generala-doble"],
      ["twos", "sixes", "generala-doble"],
      ["sixes", "generala-doble"],
      ["generala-doble"],
      ["generala"],
      ["poker"],
      ["full"],
      ["escalera"],
      ["fives"],
      ["fours"],
      ["threes"],
    ];

    for (const seatCount of [2, 3, 4]) {
      const seats = seatsOf(seatCount);
      const trace = playWholeMatch(seats, PLAIN_PLAN);
      const label = `${String(seatCount)} seats`;

      // Turn order cycles in fixed order: `(seat + 1) % players.length`, observed
      // over the whole match rather than read off the source.
      expect(trace.seatOrder, `${label}: turn order`).toEqual(Array.from({ length: seatCount * CATEGORY_IDS.length }, (_, turnIndex) => turnIndex % seatCount));

      // Every seat fills eleven boxes, and sees the same eleven offers doing it.
      for (let seat = 0; seat < seatCount; seat += 1) {
        const seenByThisSeat = trace.openBoxesSeen.filter((_, turnIndex) => turnIndex % seatCount === seat);
        expect(seenByThisSeat, `${label}: what seat ${String(seat)} was offered`).toEqual(offersEverySeatShouldSee);
        expect(isCardFull(trace.state.cards[seat]!), `${label}: seat ${String(seat)}'s card is full`).toBe(true);
      }

      // The outcome is derived identically: the same hand for everybody means
      // the same total for everybody, so the argmax set is the whole table —
      // two ids at N=2 and four at N=4, out of one unchanged expression.
      const totals = trace.state.cards.map(totalFor);
      expect(new Set(totals), `${label}: every seat totals the same`).toEqual(new Set([totals[0]!]));
      expect(getOutcome(trace.state), `${label}: outcome`).toEqual({ winnerIds: seats });
    }
  });
});
