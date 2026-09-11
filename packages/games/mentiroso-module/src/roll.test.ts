import { describe, expect, it } from "vitest";
import { applyOpeningDrawRoll, createMatch, getOutcome, totalDice } from "@hexdev/mentiroso-engine";
import type { ApplyResult, DieFace, MatchState, PlayerId } from "@hexdev/mentiroso-engine";
import type { RandomSource } from "@hexdev/platform-contract";
import { SYSTEM_ACTOR_ID, requestMentirosoSystemAction } from "./roll.js";
import type { MentirosoSystemAction, OpeningDrawRollAction, RoundRollAction } from "./roll.js";

const SEAT_0 = "seat-0-player" as PlayerId;
const SEAT_1 = "seat-1-player" as PlayerId;
const SEAT_2 = "seat-2-player" as PlayerId;
const SEAT_3 = "seat-3-player" as PlayerId;

/**
 * The instrument the entropy budget is measured with: it forwards every draw
 * and counts it. Same shape as `generala-module/src/roll.test.ts`'s own
 * `counting`, because it is measuring the identical claim for a different
 * generator.
 */
function counting(source: RandomSource): { readonly rng: RandomSource; readonly calls: () => number } {
  let calls = 0;
  return {
    rng: () => {
      calls += 1;
      return source();
    },
    calls: () => calls,
  };
}

/**
 * A fixed script of rng values, in order, that THROWS when a caller asks for
 * one more than was written down — the same discipline
 * `generala-module/src/roll.test.ts`'s own `scripted` already documents: an
 * overspend has to be loud, never wrapped, or an implementation that draws
 * more than its budget could still hand back a well-formed action.
 */
function scripted(values: readonly number[]): RandomSource {
  let next = 0;
  return () => {
    const value = values[next];
    if (value === undefined) throw new Error(`scripted rng ran out after ${String(values.length)} values`);
    next += 1;
    return value;
  };
}

/** An rng no correct implementation may call at all. Used where the claim is
 * "and it drew nothing", a stronger statement than a count of zero, and one
 * that fails at the exact call rather than at a later assertion — the same
 * `forbidden` helper `generala-module/src/roll.test.ts` already uses. */
function forbidden(reason: string): RandomSource {
  return () => {
    throw new Error(reason);
  };
}

/**
 * Maps a WANTED face onto the rng value that produces it, the same recipe
 * `sdd/mentiroso/design`'s own D3 test plan names: `(face - 1) / 6 + eps`.
 * `rollDie`'s own `Math.floor(rng() * 6)` recovers `face - 1` exactly, since
 * `eps` is far too small to cross a face boundary.
 */
const EPS = 1e-9;
function faceScript(faces: readonly DieFace[]): RandomSource {
  return scripted(faces.map((face) => (face - 1) / 6 + EPS));
}

function ok(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`the engine refused a move this test needed: ${result.violation.code} — ${result.violation.message}`);
  return result.state;
}

function requested(state: MatchState, rng: RandomSource): MentirosoSystemAction {
  const action = requestMentirosoSystemAction(state, rng);
  if (action === null) throw new Error("the requester declined a state that should produce a system action");
  return action;
}

function asOpeningDrawRoll(action: MentirosoSystemAction): OpeningDrawRollAction {
  if (action.type !== "opening-draw-roll") throw new Error(`expected an opening-draw-roll action, got ${action.type}`);
  return action;
}

function asRoundRoll(action: MentirosoSystemAction): RoundRollAction {
  if (action.type !== "round-roll") throw new Error(`expected a round-roll action, got ${action.type}`);
  return action;
}

/**
 * A fresh 4-seat opening draw, re-entered ONCE after seats 0, 1, and 3 tie at
 * the top face (6) and seat 2 draws lower (2) — `contenders` narrows from
 * `[0, 1, 2, 3]` (length 4, coinciding with the seat count) to `[0, 1, 3]`
 * (length 3, which does NOT). This is the fixture this unit's own trap
 * defence rests on: a bug that drew once per TOTAL seat instead of once per
 * still-tied CONTENDER is invisible on the fresh table below (4 seats, 4
 * contenders) and visible only here.
 */
function tiedOpeningDraw(): MatchState {
  const fresh = createMatch([SEAT_0, SEAT_1, SEAT_2, SEAT_3]);
  const firstDraw = asOpeningDrawRoll(requested(fresh, faceScript([6, 6, 2, 6])));
  return ok(applyOpeningDrawRoll(fresh, firstDraw.faces));
}

/**
 * A mid-match `awaiting-roll` state built as a literal (the same choice
 * `mentiroso-engine/src/fixtures.ts`'s own `showdownState`/
 * `midMatchEliminatedState` already make for phases a single test cannot
 * cheaply reach by chaining reducers — a mid-match roll needs a prior
 * showdown, which needs a prior bidding round, which needs THIS unit's own
 * round-roll to exist first).
 *
 * DELIBERATELY ASYMMETRIC dice counts per seat — 2, 4, 0, and 1 — summing to
 * 7 against a 4-seat table. Per this unit's own named risk: a fixture where
 * every seat holds the same count, or where the total happens to equal the
 * seat count, cannot tell "one draw per seat" apart from "one draw per die".
 * 7 ≠ 4 here, and no two seats share a count, so the two readings diverge.
 */
const ASYMMETRIC_AWAITING_ROLL: MatchState = {
  players: [
    { id: SEAT_0, seat: 0, dice: [3, 5] },
    { id: SEAT_1, seat: 1, dice: [2, 6, 4, 1] },
    { id: SEAT_2, seat: 2, dice: [] },
    { id: SEAT_3, seat: 3, dice: [6] },
  ],
  phase: { kind: "awaiting-roll", openerSeat: 1 },
};

describe("the opening-draw entropy shape", () => {
  it("draws exactly one value per seat on the very first draw of a fresh match", () => {
    const fresh = createMatch([SEAT_0, SEAT_1, SEAT_2, SEAT_3]);
    const counter = counting(faceScript([2, 6, 3, 6]));

    const action = asOpeningDrawRoll(requested(fresh, counter.rng));

    expect(counter.calls()).toBe(4);
    expect(action.faces).toEqual([2, 6, 3, 6]);
    expect(action.type).toBe("opening-draw-roll");
    expect(action.playerId).toBe(SYSTEM_ACTOR_ID);
  });

  /**
   * THE FENCE ITSELF: 4 total seats, only 3 still tied. An implementation
   * that reads `state.players.length` instead of `state.phase.contenders.length`
   * passes the test above (where the two numbers coincide) and fails here.
   */
  it("draws exactly one value per still-tied contender when the draw re-enters after a tie, not one per total seat", () => {
    const tied = tiedOpeningDraw();
    if (tied.phase.kind !== "opening-draw") throw new Error(`expected a re-entered opening-draw, got ${tied.phase.kind}`);
    expect(tied.phase.contenders).toEqual([0, 1, 3]);

    const counter = counting(faceScript([3, 5, 1]));
    const action = asOpeningDrawRoll(requested(tied, counter.rng));

    expect(counter.calls()).toBe(3);
    expect(action.faces).toEqual([3, 5, 1]);
  });

  it("ships only type, playerId, and faces — no extra field under any name", () => {
    const action = asOpeningDrawRoll(requested(createMatch([SEAT_0, SEAT_1]), faceScript([3, 5])));
    expect(Object.keys(action).sort()).toEqual(["faces", "playerId", "type"]);
  });
});

describe("the awaiting-roll entropy shape", () => {
  /**
   * THE PRIMARY FENCE FOR THIS SHAPE: 7 total dice across 4 seats holding 2,
   * 4, 0, and 1 respectively. `totalDice(state)` is asserted directly rather
   * than a hardcoded 7, so the expectation stays tied to the same derivation
   * a correct implementation must make.
   */
  it("draws exactly one value per die every seat currently holds, never one per seat, and skips eliminated seats without omitting them", () => {
    expect(totalDice(ASYMMETRIC_AWAITING_ROLL)).toBe(7);
    const counter = counting(faceScript([2, 4, 1, 3, 5, 6, 2]));

    const action = asRoundRoll(requested(ASYMMETRIC_AWAITING_ROLL, counter.rng));

    expect(counter.calls()).toBe(7);
    expect(action.diceBySeat).toEqual([
      [2, 4], // seat 0 held 2 dice
      [1, 3, 5, 6], // seat 1 held 4 dice
      [], // seat 2 is eliminated — zero dice, zero draws, still present
      [2], // seat 3 held 1 die
    ]);
    expect(action.diceBySeat).toHaveLength(4);
    expect(action.type).toBe("round-roll");
    expect(action.playerId).toBe(SYSTEM_ACTOR_ID);
  });

  it("ships only type, playerId, and diceBySeat — no extra field under any name", () => {
    const action = asRoundRoll(requested(ASYMMETRIC_AWAITING_ROLL, faceScript([2, 4, 1, 3, 5, 6, 2])));
    expect(Object.keys(action).sort()).toEqual(["diceBySeat", "playerId", "type"]);
  });
});

describe("the requester fails closed", () => {
  /**
   * THE GUARD IS LOAD-BEARING, NOT DEFENSIVE: `getOutcome` is checked BEFORE
   * the phase, so a table with a sole survivor draws nothing even in a phase
   * (`awaiting-roll`) that would otherwise draw. `forbidden` proves this at
   * the exact call, not by a later count of zero.
   */
  it("declines once the match already has a winner, even in a phase that would otherwise draw", () => {
    const oneLiveSeat: MatchState = {
      players: [
        { id: SEAT_0, seat: 0, dice: [3] },
        { id: SEAT_1, seat: 1, dice: [] },
      ],
      phase: { kind: "awaiting-roll", openerSeat: 0 },
    };
    expect(getOutcome(oneLiveSeat)).not.toBeNull();

    expect(requestMentirosoSystemAction(oneLiveSeat, forbidden("a finished match must draw nothing"))).toBeNull();
  });

  it("declines during bidding without drawing anything — a seated player has the action, not the system", () => {
    const bidding: MatchState = {
      players: [
        { id: SEAT_0, seat: 0, dice: [4] },
        { id: SEAT_1, seat: 1, dice: [2, 5] },
      ],
      phase: { kind: "bidding", turnSeat: 0, bid: null },
    };

    expect(requestMentirosoSystemAction(bidding, forbidden("bidding must draw nothing from the system"))).toBeNull();
  });

  it("declines once the match already has a winner, even while still sitting in showdown", () => {
    // A showdown state whose own die surrender already ended the match (this
    // is the 2-seat structural fact work unit C3 declared: eliminating the
    // sole rival IS the match ending). `getOutcome` is checked before the
    // phase, so this must decline like every other phase does once the match
    // is over — proven the same way, with a forbidden rng.
    const showdownButMatchOver: MatchState = {
      players: [
        { id: SEAT_0, seat: 0, dice: [4, 4] },
        { id: SEAT_1, seat: 1, dice: [] },
      ],
      phase: { kind: "showdown", bid: { quantity: 2, face: 4 }, doubterSeat: 1, matched: 2, loserSeat: 1, winnerSeat: 0 },
    };
    expect(getOutcome(showdownButMatchOver)).not.toBeNull();

    expect(requestMentirosoSystemAction(showdownButMatchOver, forbidden("a finished match must draw nothing"))).toBeNull();
  });
});

describe("the showdown resolution shape (task 3.5 — the blocking gap)", () => {
  /**
   * `showdown` used to fall through to `return null` here, the same as
   * `bidding` — which was correct reasoning for `bidding` (a seated player has
   * the move) but WRONG for `showdown`: nothing else in this whole chain ever
   * adopts `mentiroso-engine`'s own `resolveShowdown` (`showdown.ts`, work
   * unit B4), so a `null` answer here left a live match stuck in `showdown`
   * forever — task 3.5's own discovered, declared gap.
   *
   * THE FIX IS HERE, NOT IN `applyAction`, per design D6: the showdown must
   * stay ON SCREEN for `systemActionPauseMs` before resolving — that pause is
   * `MatchRoom.runAdvanceOnce`'s own pause BEFORE it applies whatever system
   * action it just requested, so the resolution has to arrive as its own,
   * separate system action, requested and applied on a LATER driving-loop
   * tick, never chained inside the SAME call that applied the doubt.
   */
  it("answers the showdown phase with a resolve action, drawing ZERO entropy — the outcome was already decided by applyDoubt", () => {
    const showdown: MatchState = {
      players: [
        { id: SEAT_0, seat: 0, dice: [4, 4] },
        { id: SEAT_1, seat: 1, dice: [2] },
        { id: SEAT_2, seat: 2, dice: [3, 3] },
      ],
      phase: { kind: "showdown", bid: { quantity: 2, face: 4 }, doubterSeat: 1, matched: 2, loserSeat: 1, winnerSeat: 0 },
    };

    // `forbidden`, not `counting`: the claim is stronger than "zero calls
    // measured after the fact" — the requester must never reach for `rng` at
    // all for this phase, the same discipline this file's own `forbidden`
    // helper already proves for the two match-over/bidding declines above.
    const action = requestMentirosoSystemAction(showdown, forbidden("showdown resolution needs no entropy — see roll.ts's own docblock"));

    expect(action).toEqual({ type: "showdown-resolve", playerId: SYSTEM_ACTOR_ID });
  });

  it("ships only type and playerId — no extra field under any name", () => {
    const showdown: MatchState = {
      players: [
        { id: SEAT_0, seat: 0, dice: [5] },
        { id: SEAT_1, seat: 1, dice: [1, 1] },
      ],
      phase: { kind: "showdown", bid: { quantity: 1, face: 5 }, doubterSeat: 1, matched: 1, loserSeat: 1, winnerSeat: 0 },
    };
    const action = requestMentirosoSystemAction(showdown, forbidden("showdown resolution needs no entropy"));
    expect(Object.keys(action!).sort()).toEqual(["playerId", "type"]);
  });
});
