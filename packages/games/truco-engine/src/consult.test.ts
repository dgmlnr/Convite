import { describe, expect, it } from "vitest";
import type { Card } from "./card.js";
import type { PlayerId } from "./ids.js";
import { createHeadToHeadMatch, createTeamMatch, startHand } from "./match.js";
import type { MatchState } from "./match.js";
import { applyAction, getLegalActions } from "./truco-chain.js";
import type { Action } from "./truco-chain.js";
import { MAX_SENAS_PER_HAND, SENA_SIGNALS, getSenasRemaining } from "./senas.js";

/**
 * Asking your partner what they make of a call.
 *
 * WHAT THE ENGINE OWNS HERE, and it is deliberately only half the feature:
 * whether you may ask, and what asking costs. The recommendation itself is
 * judgement — what a good player would do holding those cards — and a pure
 * reducer has no business inventing that, so it is produced outside and
 * reaches only the asker.
 *
 * THE COST IS A SEÑA, and that is the whole design. Asking and signalling are
 * the same act seen from two sides: both spend the hand's one budget for
 * learning about your partner's cards. A free consult would have made señas
 * decorative, because a partner you can interrogate at will tells you more,
 * and more reliably, than any signal.
 */

const north = "consult-north" as PlayerId;
const east = "consult-east" as PlayerId;
const south = "consult-south" as PlayerId;
const west = "consult-west" as PlayerId;

/** Seats 0/2 are partners and 1/3 are the other pair — `createTeamMatch`'s own
 * across-the-table arrangement, not restated as a fact here. */
const TEAM_DEAL: readonly (readonly Card[])[] = [
  [
    { suit: "espada", rank: 1 },
    { suit: "basto", rank: 4 },
    { suit: "espada", rank: 3 },
  ],
  [
    { suit: "basto", rank: 5 },
    { suit: "oro", rank: 1 },
    { suit: "basto", rank: 6 },
  ],
  [
    { suit: "oro", rank: 4 },
    { suit: "copa", rank: 4 },
    { suit: "basto", rank: 4 },
  ],
  [
    { suit: "copa", rank: 5 },
    { suit: "basto", rank: 3 },
    { suit: "copa", rank: 6 },
  ],
];

const HEADS_UP_DEAL: readonly (readonly Card[])[] = [
  [
    { suit: "espada", rank: 1 },
    { suit: "basto", rank: 4 },
    { suit: "espada", rank: 7 },
  ],
  [
    { suit: "espada", rank: 4 },
    { suit: "basto", rank: 1 },
    { suit: "oro", rank: 4 },
  ],
];

function dealt2v2(): MatchState {
  return startHand(createTeamMatch({ seatOrder: [north, east, south, west], pointsToWin: 30 }), TEAM_DEAL);
}

function apply(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`test setup: engine rejected ${action.type} — ${result.violation}`);
  return result.state;
}

const canConsult = (state: MatchState, playerId: PlayerId): boolean =>
  getLegalActions(state, playerId).some((action) => action.type === "consult-partner");

describe("when you may ask", () => {
  it("not while nothing has been called — a question with no subject is a licence to read your partner's hand", () => {
    expect(canConsult(dealt2v2(), north)).toBe(false);
  });

  it("when the other team has called truco and yours owes the answer", () => {
    const called = apply(dealt2v2(), { type: "call-truco", playerId: east, level: "truco" });
    expect(canConsult(called, north)).toBe(true);
  });

  it("and the same for an envido", () => {
    // Only a pie opens an envido (envido-opener.test.ts), and with the default
    // dealer the pies are west and north — so the floor is walked to west,
    // east and south playing their first card on the way. north's team is the
    // one that then owes the answer.
    let state = dealt2v2();
    for (const seat of [east, south]) {
      const card = getLegalActions(state, seat).find((action) => action.type === "play-card")!;
      state = apply(state, card);
    }
    const called = apply(state, { type: "call-envido", playerId: west, level: "envido" });
    expect(canConsult(called, north)).toBe(true);
  });

  it("never for the team that made the call — they have nothing to decide", () => {
    const called = apply(dealt2v2(), { type: "call-truco", playerId: east, level: "truco" });
    expect(canConsult(called, east), "the caller asking their own partner is not answering anything").toBe(false);
    expect(canConsult(called, west)).toBe(false);
  });

  it("never in a heads-up match — there is nobody to ask", () => {
    const dealt = startHand(createHeadToHeadMatch({ playerAId: north, playerBId: east, pointsToWin: 30 }), HEADS_UP_DEAL);
    const called = apply(dealt, { type: "call-truco", playerId: east, level: "truco" });
    expect(canConsult(called, north)).toBe(false);
  });

  it("not once the call has been answered", () => {
    let state = apply(dealt2v2(), { type: "call-truco", playerId: east, level: "truco" });
    state = apply(state, { type: "respond-truco", playerId: north, response: "quiero" });
    expect(canConsult(state, north)).toBe(false);
  });
});

describe("one budget, spent from either side", () => {
  it("asking spends a seña", () => {
    const called = apply(dealt2v2(), { type: "call-truco", playerId: east, level: "truco" });
    const before = getSenasRemaining(called, north);

    const asked = apply(called, { type: "consult-partner", playerId: north });

    expect(getSenasRemaining(asked, north), "the question came out of the same allowance a signal would have").toBe(before - 1);
  });

  it("and it spends only the ASKER's — a partner's allowance is their own", () => {
    const called = apply(dealt2v2(), { type: "call-truco", playerId: east, level: "truco" });
    const asked = apply(called, { type: "consult-partner", playerId: north });

    expect(getSenasRemaining(asked, south)).toBe(MAX_SENAS_PER_HAND);
  });

  it("signalling first leaves fewer questions", () => {
    let state = dealt2v2();
    for (let sent = 0; sent < MAX_SENAS_PER_HAND; sent += 1) {
      state = apply(state, { type: "send-sena", playerId: north, signal: SENA_SIGNALS[sent % SENA_SIGNALS.length]! });
    }
    state = apply(state, { type: "call-truco", playerId: east, level: "truco" });

    expect(getSenasRemaining(state, north)).toBe(0);
    expect(canConsult(state, north), "a spent allowance is spent, whichever way it went").toBe(false);
  });

  it("and asking first leaves fewer signals — the same budget, read from the other end", () => {
    let state = apply(dealt2v2(), { type: "call-truco", playerId: east, level: "truco" });
    for (let asked = 0; asked < MAX_SENAS_PER_HAND; asked += 1) {
      state = apply(state, { type: "consult-partner", playerId: north });
    }

    expect(getSenasRemaining(state, north)).toBe(0);
    expect(
      getLegalActions(state, north).some((action) => action.type === "send-sena"),
      "three questions leave nothing to signal with",
    ).toBe(false);
  });
});

describe("the reducer refuses what the legality says it should", () => {
  it("rejects a consult with no call open", () => {
    const result = applyAction(dealt2v2(), { type: "consult-partner", playerId: north });
    expect(result.ok).toBe(false);
  });

  it("rejects a consult from the calling team", () => {
    const called = apply(dealt2v2(), { type: "call-truco", playerId: east, level: "truco" });
    const result = applyAction(called, { type: "consult-partner", playerId: east });
    expect(result.ok).toBe(false);
  });

  it("leaves everything except the asker's own count untouched", () => {
    const called = apply(dealt2v2(), { type: "call-truco", playerId: east, level: "truco" });
    const asked = apply(called, { type: "consult-partner", playerId: north });

    expect(asked.teams, "asking is not a move; it scores nothing").toEqual(called.teams);
    expect(asked.hand?.truco, "and it does not answer the call either").toEqual(called.hand?.truco);
    expect(asked.hand?.senas, "it is a question, not a claim — no signal is recorded").toEqual(called.hand?.senas);
  });
});
