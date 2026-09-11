import { describe, expect, it, vi } from "vitest";
import { describeGameModule, findLeakedSecrets } from "@hexdev/platform-contract";
import type { ApplyResult, RandomSource, SeatAssignment } from "@hexdev/platform-contract";
import { DEFAULT_THINKING_DELAY_MS } from "@hexdev/mentiroso-bot";
import { applyDoubt, applyRaise, ceilingFor, createMatch, getLegalActions, getOutcome, getViewFor, resolveShowdown, secretsFor, totalDice } from "@hexdev/mentiroso-engine";
import type { DieFace, MatchState, PlayerId } from "@hexdev/mentiroso-engine";
import { SYSTEM_ACTOR_ID as ROLL_SYSTEM_ACTOR_ID, requestMentirosoSystemAction as rollRequestMentirosoSystemAction } from "./roll.js";
import { SYSTEM_ACTOR_ID, applyAction, mentirosoHiddenState, mentirosoModule, mentirosoModule4, mentirosoModule6, requestMentirosoSystemAction } from "./index.js";
import type { MentirosoModuleAction } from "./index.js";

/**
 * `index.ts`'s own tests (SDD `mentiroso`, work unit C2/task 3.2, design D4).
 *
 * THE POINT OF THIS FILE: `mentiroso-engine`'s own `view.test.ts` (work unit
 * B5) could only prove its redaction guarantee with `findLeakedSecretsLocally`
 * — a deliberate LOCAL re-implementation of the platform's scan, because
 * `mentiroso-engine` is L0 and must not import `@hexdev/platform-contract`.
 * `mentiroso-module` is L2 and already depends on it (work unit C1's own
 * `package.json`), so this is the first point in the chain where `secretsFor`
 * can be proven against the REAL `findLeakedSecrets` instead of a
 * reimplementation — no test anywhere in this repo has done that for this
 * game until now.
 *
 * EVERY FIXTURE BELOW AVOIDS THIS UNIT'S OWN NAMED RISK
 * (`sdd/mentiroso/tasks`): no two players in the same state share an
 * identical dice array (a swapped-array bug would hide behind that
 * coincidence), and no player's `dice.length` equals their own `seat` (a
 * "dice count" vs "seat number" confusion would hide behind THAT one). The
 * self-check test below asserts this directly rather than trusting the
 * comment — `AGENTS.md`'s own "un comentario que afirma una garantía es una
 * hipótesis". The one deliberate exception is `coincidentalScalarState`
 * below, whose whole job is to construct exactly that kind of coincidence and
 * prove it does NOT cause a false leak — see its own docblock.
 */

const PLAYER_0 = "index-test-seat-0" as PlayerId;
const PLAYER_1 = "index-test-seat-1" as PlayerId;
const PLAYER_2 = "index-test-seat-2" as PlayerId;
const PLAYER_3 = "index-test-seat-3" as PlayerId;
const SEATED_PLAYERS: readonly PlayerId[] = [PLAYER_0, PLAYER_1, PLAYER_2, PLAYER_3];

/** A bidding-phase, four-seat match, nobody eliminated — the floor state
 * (design D4's own fixtures note): `secretsFor` MUST produce a real secret
 * somewhere this unit's own fixtures reach. */
const biddingState: MatchState = {
  players: [
    { id: PLAYER_0, seat: 0, dice: [5, 2, 6] },
    { id: PLAYER_1, seat: 1, dice: [4, 4, 1, 3] },
    { id: PLAYER_2, seat: 2, dice: [6, 5, 5] },
    { id: PLAYER_3, seat: 3, dice: [1] },
  ],
  phase: { kind: "bidding", turnSeat: 2, bid: { quantity: 3, face: 6 } },
};

/** `secretsFor` MUST return no secrets here (design D4: the opening draw is
 * public) — built through the REAL `createMatch`, not a hand-built literal,
 * since a fresh match is exactly what that function already produces. */
const openingDrawState: MatchState = createMatch(SEATED_PLAYERS);

/** `secretsFor` MUST return no secrets here either (design D4: the reveal IS
 * the rule). Hand-built, mirroring `mentiroso-engine/src/fixtures.ts`'s own
 * `showdownState` — internally consistent with `showdown.ts`'s own rule this
 * state does not call: three 6s on the table (two on seat 0, one on seat 1)
 * exactly meet a bid of (3, 6), so the bidder (seat 0) wins on "at least" and
 * the doubter (seat 1) surrenders a die. */
const showdownState: MatchState = {
  players: [
    { id: PLAYER_0, seat: 0, dice: [2, 6, 6] },
    { id: PLAYER_1, seat: 1, dice: [6, 1, 4] },
    { id: PLAYER_2, seat: 2, dice: [3, 3, 5, 5] },
    { id: PLAYER_3, seat: 3, dice: [5] },
  ],
  phase: { kind: "showdown", bid: { quantity: 3, face: 6 }, doubterSeat: 1, matched: 3, loserSeat: 1, winnerSeat: 0 },
};

/** A bidding-phase, mid-match state with seat 2 eliminated (`dice: []`) — the
 * fixture the empty-array exclusion requirement needs: a real eliminated seat
 * alongside real secrets for the seats still active. */
const midMatchEliminatedState: MatchState = {
  players: [
    { id: PLAYER_0, seat: 0, dice: [3, 3, 5] },
    { id: PLAYER_1, seat: 1, dice: [2, 6] },
    { id: PLAYER_2, seat: 2, dice: [] },
    { id: PLAYER_3, seat: 3, dice: [5, 6, 4, 2] },
  ],
  phase: { kind: "bidding", turnSeat: 3, bid: { quantity: 2, face: 4 } },
};

const SCANNED_STATES: readonly MatchState[] = [biddingState, openingDrawState, showdownState, midMatchEliminatedState];

/**
 * The self-check below excludes `openingDrawState` on purpose: it is built
 * through the REAL `createMatch`, whose own docblock states every seat opens
 * with IDENTICAL placeholder dice — a correct, coincidental match with no
 * risk attached, since `secretsFor` already declares zero secrets for that
 * phase (asserted separately below). The risk this file's own header names is
 * about states that DO carry real per-seat secrets, which is exactly the
 * three states left here.
 */
const HAND_BUILT_STATES: readonly MatchState[] = [biddingState, showdownState, midMatchEliminatedState];

/** `mentirosoHiddenState` is typed as the whole `HiddenState<MatchState>`
 * union (design D4: the shared declaration these tests exercise ahead of any
 * registration existing). Narrowing once, here, lets every test below call
 * `declaredSecretsFor` directly instead of repeating the guard — and if the
 * declared `kind` is ever wrong, THIS call is what turns red, inside the one
 * test exercising it, never a whole-file crash. */
function declaredSecretsFor(state: MatchState, viewer: PlayerId): readonly unknown[] {
  if (mentirosoHiddenState.kind !== "hidden-per-seat") {
    throw new Error(`mentirosoHiddenState must declare kind "hidden-per-seat", got ${mentirosoHiddenState.kind}`);
  }
  return mentirosoHiddenState.secretsFor(state, viewer);
}

describe("index.ts fixtures — this unit's own named risk, checked rather than assumed", () => {
  it("no two players in the same hand-built state share an identical dice array", () => {
    for (const state of HAND_BUILT_STATES) {
      for (const player of state.players) {
        const sameArray = state.players.filter((other) => other.id !== player.id && JSON.stringify(other.dice) === JSON.stringify(player.dice));
        expect(sameArray).toEqual([]);
      }
    }
  });

  it("no player's dice count equals their own seat number, in any hand-built state", () => {
    for (const state of HAND_BUILT_STATES) {
      for (const player of state.players) {
        expect(player.dice.length).not.toBe(player.seat);
      }
    }
  });
});

describe("mentirosoHiddenState — the shared declaration (design D4)", () => {
  it("declares kind hidden-per-seat", () => {
    expect(mentirosoHiddenState.kind).toBe("hidden-per-seat");
  });

  it("hands secretsFor straight through, with no adapter — 'shared not copied'", () => {
    // mentiroso-engine/src/view.ts's own docblock: this unit "can hand this
    // function straight to hiddenState... with no adapter". Referential
    // equality is what proves nobody wrapped it since.
    if (mentirosoHiddenState.kind !== "hidden-per-seat") throw new Error("unreachable — asserted above");
    expect(mentirosoHiddenState.secretsFor).toBe(secretsFor);
  });
});

describe("mentirosoHiddenState.secretsFor + getViewFor — the real platform scan (design D4)", () => {
  it("no seated player's view holds a value this game declares secret from them, across every fixture state", () => {
    const leaks = SCANNED_STATES.flatMap((state) =>
      SEATED_PLAYERS.flatMap((seat) => {
        const leaked = findLeakedSecrets(getViewFor(state, seat), declaredSecretsFor(state, seat));
        return leaked.length === 0 ? [] : [{ leakedTo: seat, leaked }];
      }),
    );
    expect(leaks).toEqual([]);
  });

  it("THE FLOOR: at least one fixture state actually produces a real secret — a scan with nothing to find is not a fence", () => {
    const declared = SCANNED_STATES.reduce(
      (total, state) => total + SEATED_PLAYERS.reduce((seatTotal, seat) => seatTotal + declaredSecretsFor(state, seat).length, 0),
      0,
    );
    expect(declared).toBeGreaterThan(0);
  });

  it("declares NO secrets during the opening draw — the draw is public", () => {
    expect(declaredSecretsFor(openingDrawState, PLAYER_0)).toEqual([]);
  });

  it("declares NO secrets at showdown — the reveal IS the rule", () => {
    expect(declaredSecretsFor(showdownState, PLAYER_0)).toEqual([]);
  });

  it("THE MANDATORY NEGATIVE CONTROL: a view that DOES leak a rival's dice array is caught by the REAL scan", () => {
    const view = getViewFor(biddingState, PLAYER_0);
    // The exact bug this whole requirement set exists to prevent: a rival's
    // true dice smuggled into the view under a plausible-looking extra field
    // — run through @hexdev/platform-contract's own findLeakedSecrets, not a
    // local reimplementation.
    const brokenView = { ...view, debugRivalDice: biddingState.players[1]!.dice };
    const leaked = findLeakedSecrets(brokenView, declaredSecretsFor(biddingState, PLAYER_0));
    expect(leaked.length).toBeGreaterThan(0);
    expect(leaked).toContainEqual([4, 4, 1, 3]);
  });

  /**
   * mentiroso-hidden-dice's own "coincidental scalar match" scenario,
   * mirroring `mentiroso-engine/src/view.test.ts`'s local version, run here
   * against the REAL scan instead. Viewer sits at seat 2, holds exactly 2
   * dice, one of which reads 2, and the current bid's quantity is ALSO 2 —
   * three unrelated 2s, none of them the declared secret. A rival (seat 0)
   * separately holds a die reading 2. This is the ONE fixture in this file
   * that deliberately breaks the "no coincidences" rule above, on purpose:
   * that is the scenario it exists to construct.
   */
  it("a coincidental scalar match elsewhere in the view is NOT treated as a leak", () => {
    const coincidentalScalarState: MatchState = {
      players: [
        { id: PLAYER_0, seat: 0, dice: [2, 5] },
        { id: PLAYER_1, seat: 1, dice: [4, 6, 1] },
        { id: PLAYER_2, seat: 2, dice: [2, 6] },
        { id: PLAYER_3, seat: 3, dice: [5, 6, 1, 3] },
      ],
      phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 2, face: 6 } },
    };
    const leaked = findLeakedSecrets(getViewFor(coincidentalScalarState, PLAYER_2), declaredSecretsFor(coincidentalScalarState, PLAYER_2));
    expect(leaked).toEqual([]);
  });

  it("THE FENCE: excludes an eliminated seat's empty dice array from the declared secrets", () => {
    const secrets = declaredSecretsFor(midMatchEliminatedState, PLAYER_3);
    expect(secrets).not.toContainEqual([]);
    // A correctly redacted view of a state with an eliminated seat still
    // measures real secrets from the seats still active — the floor test
    // above already covers this state, this asserts it directly too.
    expect(secrets.length).toBeGreaterThan(0);
  });
});

describe("index.ts — the roll.ts barrel re-export (this package's first public surface)", () => {
  it("re-exports SYSTEM_ACTOR_ID unchanged", () => {
    expect(SYSTEM_ACTOR_ID).toBe(ROLL_SYSTEM_ACTOR_ID);
  });

  it("re-exports requestMentirosoSystemAction unchanged", () => {
    expect(requestMentirosoSystemAction).toBe(rollRequestMentirosoSystemAction);
  });
});

/**
 * `mentirosoModule` — the FIRST GameModule registration (SDD `mentiroso`,
 * work unit C3/task 3.3, seat count 2). Every fixture below is sized for
 * exactly two seats, matching `metadata.seatCount` — unlike this file's own
 * C2-era `PLAYER_0..PLAYER_3` fixtures above, which exist purely to prove
 * `mentirosoHiddenState` against an arbitrary table shape.
 */
const TWO_SEAT_P0 = "c3-seat-0" as PlayerId;
const TWO_SEAT_P1 = "c3-seat-1" as PlayerId;
const TWO_SEAT_ASSIGNMENTS: readonly SeatAssignment[] = [
  { seat: 0, playerId: TWO_SEAT_P0 },
  { seat: 1, playerId: TWO_SEAT_P1 },
];

/** Typed against the PLATFORM's `ApplyResult`, mirroring
 * `generala-module/src/index.test.ts`'s own `ok` helper. */
function ok(result: ApplyResult<MatchState>): MatchState {
  if (!result.ok) throw new Error(`a move this test needed was refused: ${result.violation.code} — ${result.violation.message}`);
  return result.state;
}

/** A bidding-phase, two-seat match, nobody eliminated — the floor state
 * (design D4's own fixtures note): `secretsFor` MUST produce a real secret
 * somewhere this registration's own fixtures reach. */
const twoSeatReachableState: MatchState = {
  players: [
    { id: TWO_SEAT_P0, seat: 0, dice: [2, 5, 6] },
    { id: TWO_SEAT_P1, seat: 1, dice: [4, 1] },
  ],
  phase: { kind: "bidding", turnSeat: 1, bid: { quantity: 3, face: 5 } },
};

/** One of the raises `getLegalActions` offers seat 1 above (same quantity,
 * strictly higher face) — named as a literal so the suite's `toContainEqual`
 * has something concrete to find. */
const TWO_SEAT_LEGAL_ACTION: MentirosoModuleAction = { type: "raise", playerId: TWO_SEAT_P1, bid: { quantity: 3, face: 6 } };

/** `secretsFor` MUST return no secrets here (design D4: the opening draw is
 * public) — built through the REGISTRATION's own `createMatch`, not a
 * hand-built literal, since a fresh two-seat table is exactly what that
 * function already produces. */
const twoSeatOpeningDrawState: MatchState = mentirosoModule.createMatch({}, TWO_SEAT_ASSIGNMENTS);

/** `secretsFor` MUST return no secrets here either (design D4: the reveal IS
 * the rule) — internally consistent with `showdown.ts`'s own tally rule this
 * state does not call: three 6s on the table (two on seat 0, one on seat 1)
 * exactly meet a bid of (3, 6), so the bidder (seat 0) wins on "at least" and
 * the doubter (seat 1) surrenders a die. */
const twoSeatShowdownState: MatchState = {
  players: [
    { id: TWO_SEAT_P0, seat: 0, dice: [2, 6, 6] },
    { id: TWO_SEAT_P1, seat: 1, dice: [1, 6] },
  ],
  phase: { kind: "showdown", bid: { quantity: 3, face: 6 }, doubterSeat: 1, matched: 3, loserSeat: 1, winnerSeat: 0 },
};

/**
 * A finished match: seat 0 holds zero dice, seat 1 holds two.
 *
 * WITH EXACTLY TWO SEATS, "one seat eliminated, mid-match" AND "the match is
 * over" are the SAME state — eliminating either lone opponent ends a
 * two-seat match by definition (mentiroso-rules: "the sole seat left holding
 * dice MUST win"). So this state does double duty: it is `terminalState`
 * for the outcome assertions below, AND it is what exercises the
 * empty-array-exclusion fence (mentiroso-hidden-dice) for THIS registration
 * — seat 0's empty `dice` array sits alongside seat 1's real, non-empty one.
 * A distinct "eliminated but still ongoing" sample only exists at 3+ seats,
 * which is task 3.4's registration, not this one.
 */
const twoSeatTerminalState: MatchState = {
  players: [
    { id: TWO_SEAT_P0, seat: 0, dice: [] },
    { id: TWO_SEAT_P1, seat: 1, dice: [6, 3] },
  ],
  phase: { kind: "bidding", turnSeat: 1, bid: { quantity: 1, face: 6 } },
};

/**
 * The hand-built states above, excluding the one built through the REAL
 * `createMatch` — mirrors this file's own `HAND_BUILT_STATES` from work unit
 * C2: `twoSeatOpeningDrawState` legitimately gives both seats the identical
 * placeholder dice (`createMatch`'s own docblock), a correct coincidence
 * with nothing to hide since `secretsFor` already declares zero secrets for
 * that phase.
 */
const TWO_SEAT_HAND_BUILT_STATES: readonly MatchState[] = [twoSeatReachableState, twoSeatShowdownState, twoSeatTerminalState];

describe("mentirosoModule fixtures — this unit's own named risk, checked rather than assumed", () => {
  it("no two players in the same hand-built state share an identical dice array", () => {
    for (const state of TWO_SEAT_HAND_BUILT_STATES) {
      for (const player of state.players) {
        const sameArray = state.players.filter((other) => other.id !== player.id && JSON.stringify(other.dice) === JSON.stringify(player.dice));
        expect(sameArray).toEqual([]);
      }
    }
  });

  it("no LIVE player's dice count equals their own seat number, in any hand-built state", () => {
    // Excludes an eliminated seat (dice: []): its own contribution is
    // already zero regardless of seat number, and `secretsFor` excludes it
    // entirely — the coincidence this check guards against only matters for
    // a seat that actually carries a secret.
    for (const state of TWO_SEAT_HAND_BUILT_STATES) {
      for (const player of state.players) {
        if (player.dice.length === 0) continue;
        expect(player.dice.length).not.toBe(player.seat);
      }
    }
  });
});

describeGameModule(
  mentirosoModule,
  {
    config: {},
    seats: TWO_SEAT_ASSIGNMENTS,
    playerId: TWO_SEAT_P1,
    reachableState: twoSeatReachableState,
    legalAction: TWO_SEAT_LEGAL_ACTION,
    terminalState: twoSeatTerminalState,
    botTier: "easy",
    hiddenStateSamples: [twoSeatOpeningDrawState, twoSeatShowdownState],
  },
  { describe, it, expect },
);

describe("mentirosoModule.applyAction — actor gating and delegation (work unit C3/task 3.3)", () => {
  it("hands a legal raise straight to the engine's own applyRaise", () => {
    const legal = getLegalActions(twoSeatReachableState, TWO_SEAT_P1).find((action) => action.type === "raise")!;
    expect(applyAction(twoSeatReachableState, legal)).toEqual(applyRaise(twoSeatReachableState, legal as Extract<typeof legal, { readonly type: "raise" }>));
  });

  it("hands a legal doubt straight to the engine's own applyDoubt, leaving the state in the showdown phase", () => {
    const withBid: MatchState = { ...twoSeatReachableState, phase: { kind: "bidding", turnSeat: 1, bid: { quantity: 1, face: 1 } } };
    const doubt = getLegalActions(withBid, TWO_SEAT_P1).find((action) => action.type === "doubt")!;
    const result = ok(applyAction(withBid, doubt));
    expect(result.phase.kind).toBe("showdown");
    expect(applyAction(withBid, doubt)).toEqual(applyDoubt(withBid, doubt as Extract<typeof doubt, { readonly type: "doubt" }>));
  });

  it("refuses an opening-draw-roll authored by a seated player, not just an outsider", () => {
    const forged: MentirosoModuleAction = { type: "opening-draw-roll", playerId: TWO_SEAT_P0, faces: [4, 4] };
    expect(applyAction(twoSeatOpeningDrawState, forged)).toEqual({
      ok: false,
      violation: { code: "not-a-system-actor", message: expect.any(String) },
    });
  });

  it("refuses a round-roll authored by an id that sits at no seat", () => {
    const stranger = "mallory" as PlayerId;
    const state: MatchState = { players: twoSeatReachableState.players, phase: { kind: "awaiting-roll", openerSeat: 0 } };
    const forged: MentirosoModuleAction = { type: "round-roll", playerId: stranger, diceBySeat: [[4, 4, 4], [5, 5]] };
    expect(applyAction(state, forged)).toEqual({
      ok: false,
      violation: { code: "not-a-system-actor", message: expect.any(String) },
    });
  });

  it("applies the system's own opening-draw-roll, delegating to applyOpeningDrawRoll", () => {
    const drawn: MentirosoModuleAction = { type: "opening-draw-roll", playerId: SYSTEM_ACTOR_ID, faces: [3, 6] };
    const result = ok(applyAction(twoSeatOpeningDrawState, drawn));
    expect(result.phase).toEqual({ kind: "awaiting-roll", openerSeat: 1 });
  });

  it("applies the system's own round-roll, delegating to applyRoundRoll and opening a fresh round of bidding", () => {
    const awaitingRoll: MatchState = { players: twoSeatReachableState.players, phase: { kind: "awaiting-roll", openerSeat: 0 } };
    const rolled: MentirosoModuleAction = { type: "round-roll", playerId: SYSTEM_ACTOR_ID, diceBySeat: [[3, 3, 3], [5, 5]] };
    const result = ok(applyAction(awaitingRoll, rolled));
    expect(result.phase).toEqual({ kind: "bidding", turnSeat: 0, bid: null });
    expect(result.players.map((player) => player.dice)).toEqual([[3, 3, 3], [5, 5]]);
  });

  it("refuses the system's own round-roll once the match is already over", () => {
    const awaitingRoll: MatchState = { players: twoSeatTerminalState.players, phase: { kind: "awaiting-roll", openerSeat: 1 } };
    const rolled: MentirosoModuleAction = { type: "round-roll", playerId: SYSTEM_ACTOR_ID, diceBySeat: [[], [1, 2]] };
    expect(getOutcome(awaitingRoll)).not.toBeNull();
    expect(applyAction(awaitingRoll, rolled)).toEqual({
      ok: false,
      violation: { code: "match-over", message: expect.any(String) },
    });
  });

  it("refuses a showdown-resolve authored by a seated player, not just an outsider (task 3.5)", () => {
    const forged: MentirosoModuleAction = { type: "showdown-resolve", playerId: TWO_SEAT_P0 };
    expect(applyAction(twoSeatShowdownState, forged)).toEqual({
      ok: false,
      violation: { code: "not-a-system-actor", message: expect.any(String) },
    });
  });

  it("applies the system's own showdown-resolve, delegating to resolveShowdown and opening awaiting-roll with the winner as opener (task 3.5)", () => {
    const resolveAction: MentirosoModuleAction = { type: "showdown-resolve", playerId: SYSTEM_ACTOR_ID };
    const result = ok(applyAction(twoSeatShowdownState, resolveAction));
    // twoSeatShowdownState's own showdown phase declares winnerSeat: 0 (seat
    // 0's bid of (3, 6) was met exactly by the table's three 6es).
    expect(result.phase).toEqual({ kind: "awaiting-roll", openerSeat: 0 });
    // NOT chained inline (see roll.ts's own top docblock, design D6): this is
    // the SAME transition `resolveShowdown` alone already produces — proving
    // `applyAction` delegates rather than re-implements it, the identical
    // discipline this file's own raise/doubt tests already apply above.
    expect(applyAction(twoSeatShowdownState, resolveAction)).toEqual(resolveShowdown(twoSeatShowdownState));
  });

  it("refuses the system's own showdown-resolve once the match is already over (task 3.5)", () => {
    // Forged directly (bypassing `requestMentirosoSystemAction`, which would
    // never offer this for an already-finished match — its own outcome guard
    // runs before the phase check): the SAME redundant safety net every
    // other system action already carries in this function.
    const showdownButMatchOver: MatchState = {
      players: [
        { id: TWO_SEAT_P0, seat: 0, dice: [] },
        { id: TWO_SEAT_P1, seat: 1, dice: [6, 3] },
      ],
      phase: { kind: "showdown", bid: { quantity: 1, face: 6 }, doubterSeat: 0, matched: 1, loserSeat: 0, winnerSeat: 1 },
    };
    expect(getOutcome(showdownButMatchOver)).not.toBeNull();
    const resolveAction: MentirosoModuleAction = { type: "showdown-resolve", playerId: SYSTEM_ACTOR_ID };
    expect(applyAction(showdownButMatchOver, resolveAction)).toEqual({
      ok: false,
      violation: { code: "match-over", message: expect.any(String) },
    });
  });

  it("refuses a player's raise once the match is already over", () => {
    const action: MentirosoModuleAction = { type: "raise", playerId: TWO_SEAT_P1, bid: { quantity: 1, face: 1 } };
    expect(applyAction(twoSeatTerminalState, action)).toEqual({
      ok: false,
      violation: { code: "match-over", message: expect.any(String) },
    });
  });
});

describe("the table mentirosoModule builds", () => {
  it("refuses to seat one player twice", () => {
    expect(() => mentirosoModule.createMatch({}, [{ seat: 0, playerId: TWO_SEAT_P0 }, { seat: 1, playerId: TWO_SEAT_P0 }])).toThrow(/distinct player/);
  });

  it("refuses a seat list that is not one player at each of its two seats", () => {
    expect(() => mentirosoModule.createMatch({}, [{ seat: 0, playerId: TWO_SEAT_P0 }])).toThrow(/seats 0/);
    expect(() => mentirosoModule.createMatch({}, [...TWO_SEAT_ASSIGNMENTS, { seat: 2, playerId: "third" as PlayerId }])).toThrow(/seats 0/);
    expect(() => mentirosoModule.createMatch({}, [{ seat: 3, playerId: TWO_SEAT_P0 }, { seat: 4, playerId: TWO_SEAT_P1 }])).toThrow(/seats 0/);
  });

  it("seats the table by the seat number, not by the order the assignments arrived in", () => {
    const backwards = mentirosoModule.createMatch({}, [
      { seat: 1, playerId: TWO_SEAT_P1 },
      { seat: 0, playerId: TWO_SEAT_P0 },
    ]);
    expect(mentirosoModule.getViewFor(backwards, TWO_SEAT_P0).self).toEqual({ playerId: TWO_SEAT_P0, seat: 0, dice: backwards.players[0]!.dice });
    expect(mentirosoModule.getViewFor(backwards, TWO_SEAT_P1).self).toEqual({ playerId: TWO_SEAT_P1, seat: 1, dice: backwards.players[1]!.dice });
  });
});

describe("what mentirosoModule tells the registry", () => {
  it("declares no config option at all, so the empty config is its only modality", () => {
    expect(mentirosoModule.configOptions).toEqual([]);
  });

  it("declares two seats, the dados shelf and its own family", () => {
    expect(mentirosoModule.metadata).toEqual({
      seatCount: 2,
      gameFamily: "mentiroso",
      section: "dados",
      displayNameKey: "games.mentiroso2.name",
      assetBase: "/games/mentiroso",
    });
    expect(mentirosoModule.id).toBe("mentiroso-2");
  });
});

describe("mentirosoModule — the engine's three read members are handed through unwrapped", () => {
  it("exposes the engine's own getLegalActions, getViewFor and getOutcome, not a wrapper around them", () => {
    expect(mentirosoModule.getLegalActions).toBe(getLegalActions);
    expect(mentirosoModule.getViewFor).toBe(getViewFor);
    expect(mentirosoModule.getOutcome).toBe(getOutcome);
  });
});

describe("mentirosoModule.createBot wires REAL tiers (task 3.6 — the day-one placeholder is gone)", () => {
  /**
   * The retired placeholder always picked `legalActions[0]` — the smallest
   * legal raise, whenever one was offered. This state's own current bid is
   * mathematically impossible to hold from the seat in turn's own vantage:
   * `probabilityBidHolds` (`mentiroso-bot/src/normal.ts`) needs 6 successes
   * (`bid.quantity - ownMatching`, `6 - 0`, seat 1 holds no 3s) out of only 5
   * unseen dice (seat 0's own count), and `atLeast` (task 4.1) returns
   * EXACTLY zero for `k > n`, not merely a small number. Because `normal`'s
   * own doubt/raise coin flip is `rng() >= estimate` and `RandomSource` never
   * reaches 1 (`[0, 1)`), an estimate of exactly 0 makes the doubt outright
   * DETERMINISTIC — true for every draw `createBot`'s own crypto-backed
   * `defaultRng` could possibly produce — so this test needs no injected rng
   * to tell a genuine evaluation apart from the retired placeholder's pick.
   */
  const IMPOSSIBLE_BID_STATE: MatchState = {
    players: [
      { id: TWO_SEAT_P0, seat: 0, dice: [1, 1, 1, 1, 1] },
      { id: TWO_SEAT_P1, seat: 1, dice: [1, 2] },
    ],
    phase: { kind: "bidding", turnSeat: 1, bid: { quantity: 6, face: 3 } },
  };

  it("the normal tier doubts an impossible bid instead of raising with legal[0], the retired placeholder's own pick", async () => {
    const legal = getLegalActions(IMPOSSIBLE_BID_STATE, TWO_SEAT_P1);
    expect(legal[0]?.type).toBe("raise"); // sanity: the retired placeholder would have raised
    const bot = mentirosoModule.createBot!("normal");
    const chosen = await bot.chooseAction(getViewFor(IMPOSSIBLE_BID_STATE, TWO_SEAT_P1), legal, 50);
    expect(chosen.type).toBe("doubt");
  });

  it("the hard tier is wired too, and still only ever returns an offered legal action", async () => {
    const legal = getLegalActions(twoSeatReachableState, TWO_SEAT_P1);
    const bot = mentirosoModule.createBot!("hard");
    const chosen = await bot.chooseAction(getViewFor(twoSeatReachableState, TWO_SEAT_P1), legal, 50);
    expect(legal).toContainEqual(chosen);
  });

  it("wraps whichever tier it returns in the shared thinking delay (real setTimeout, proven with fake timers)", async () => {
    vi.useFakeTimers();
    try {
      const legal = getLegalActions(twoSeatReachableState, TWO_SEAT_P1);
      const view = getViewFor(twoSeatReachableState, TWO_SEAT_P1);
      const bot = mentirosoModule.createBot!("easy");
      let resolved = false;
      void Promise.resolve(bot.chooseAction(view, legal, 50)).then(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(DEFAULT_THINKING_DELAY_MS - 100);
      expect(resolved, "still waiting just before the delay elapses").toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(resolved, "resolved once it has").toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the full round trip through a doubt (SDD `mentiroso`, task 3.5 — the blocking gap this unit closes)", () => {
  /**
   * THE WALKTHROUGH THE GAP ITSELF DEMANDS. No assertion anywhere else in
   * this file, or in `roll.test.ts`, could have caught the original gap:
   * `applyDoubt` on its own is a correct reducer, and
   * `requestMentirosoSystemAction` returning `null` for `showdown` was ALSO,
   * in isolation, a correct-LOOKING guard — it mirrors the exact shape of
   * the two other "nothing to draw here" branches (`bidding` still returns
   * `null` today, correctly). Only DRIVING the state machine end to end —
   * using the SAME two doors `MatchRoom.runAdvanceOnce` itself uses,
   * `requestMentirosoSystemAction` then `applyAction`, and nothing else —
   * exposes that nothing ever advanced a match sitting in `showdown`.
   *
   * THREE SEATS, DELIBERATELY, NOT TWO. Work unit C3's own registration
   * (`mentirosoModule`, seat count 2) already declared the trap this test
   * has to avoid: at exactly two seats, "the showdown resolved" and "the
   * match ended" are the SAME state, because surrendering the sole rival's
   * only die simultaneously ends the match. A walkthrough built on a
   * two-seat table would not be able to tell "the resolution step ran" apart
   * from "the match just happened to end" — the exact family of false-green
   * this whole chain has already hit three times. A third seat, holding
   * its own dice throughout, guarantees the match is still very much alive
   * after the showdown resolves, so reaching the NEXT round's roll is only
   * possible if the resolution step actually ran.
   *
   * This does not go through `mentirosoModule` itself (registered at
   * seatCount 2 only — task 3.4 has not shipped a 3+ seat registration yet):
   * it drives the standalone `requestMentirosoSystemAction` and `applyAction`
   * functions directly over a 3-seat `MatchState`, exactly the shape
   * `MatchRoom` itself is agnostic to (it only ever calls a module's own
   * `applyAction`/`requestSystemAction`, never assumes a seat count).
   */
  const THREE_SEAT_P0 = "walkthrough-seat-0" as PlayerId;
  const THREE_SEAT_P1 = "walkthrough-seat-1" as PlayerId;
  const THREE_SEAT_P2 = "walkthrough-seat-2" as PlayerId;

  const EPS = 1e-9;
  /** Maps a WANTED face onto the rng value that produces it — the same
   * `(face - 1) / 6 + eps` recipe `roll.test.ts` already documents, rebuilt
   * locally rather than imported: each test file in this package owns its
   * own fixtures (this package's `package.json` exposes no fixtures subpath
   * to share one across files). */
  function faceScript(faces: readonly DieFace[]): RandomSource {
    let next = 0;
    return () => {
      const face = faces[next];
      if (face === undefined) throw new Error(`walkthrough rng ran out after ${String(faces.length)} values`);
      next += 1;
      return (face - 1) / 6 + EPS;
    };
  }

  /** An rng no correct call may reach for at all — proves the showdown
   * resolution step spends zero entropy, the same `forbidden` discipline
   * `roll.test.ts` already uses. */
  function forbidden(reason: string): RandomSource {
    return () => {
      throw new Error(reason);
    };
  }

  /** The exact two-call shape `MatchRoom.runAdvanceOnce` itself makes when a
   * table sits still with nobody able to act: ask for a system action, then
   * apply it. A `null` here means the table is stuck — thrown loudly rather
   * than silently returning `state` unchanged, so a regression fails AT the
   * step that stalled, not several assertions later. */
  function driveOneSystemStep(state: MatchState, rng: RandomSource): MatchState {
    const action = requestMentirosoSystemAction(state, rng);
    if (action === null) throw new Error("the requester declined a state that should have produced a system action — the match is stuck");
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`the system's own action was refused: ${result.violation.code} — ${result.violation.message}`);
    return result.state;
  }

  it("drives a created table through the opening draw, a bid, a doubt and the showdown, into the NEXT round's roll — with no direct engine call", () => {
    let state: MatchState = createMatch([THREE_SEAT_P0, THREE_SEAT_P1, THREE_SEAT_P2]);
    expect(state.phase.kind).toBe("opening-draw");
    expect(totalDice(state)).toBe(15); // 3 seats x STARTING_DICE_PER_SEAT (5)

    // THE OPENING DRAW — one distinct face per seat, so a single winner
    // emerges on the very first draw. A re-entered tie is already its own
    // fenced path in `roll.test.ts`/`apply.test.ts`; this walkthrough is
    // about the FULL round trip, not the draw's own tie-breaking mechanism.
    state = driveOneSystemStep(state, faceScript([3, 6, 2]));
    expect(state.phase).toEqual({ kind: "awaiting-roll", openerSeat: 1 });

    // THE FIRST ROUND'S ROLL — every seat's own fresh dice (5 values each,
    // in seat order), through the SAME requester/applier pair the driving
    // loop itself uses.
    state = driveOneSystemStep(state, faceScript([2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2]));
    expect(state.phase).toEqual({ kind: "bidding", turnSeat: 1, bid: null });

    // A BID — the opener raises. Any legal raise does: this walkthrough
    // fences the STATE MACHINE, not a specific tally.
    const raise = getLegalActions(state, THREE_SEAT_P1).find((action) => action.type === "raise");
    if (raise === undefined) throw new Error("expected at least one legal raise for the opening bid");
    const afterRaise = applyAction(state, raise);
    if (!afterRaise.ok) throw new Error(`the opening raise was refused: ${afterRaise.violation.code}`);
    state = afterRaise.state;
    const biddingPhase = state.phase;
    if (biddingPhase.kind !== "bidding") throw new Error(`expected bidding to continue, got ${biddingPhase.kind}`);
    const nextPlayerId = state.players.find((player) => player.seat === biddingPhase.turnSeat)!.id;

    // A DOUBT — legal now that a bid exists.
    const doubt = getLegalActions(state, nextPlayerId).find((action) => action.type === "doubt");
    if (doubt === undefined) throw new Error("expected doubt to be legal once a bid exists");
    const afterDoubt = applyAction(state, doubt);
    if (!afterDoubt.ok) throw new Error(`the doubt was refused: ${afterDoubt.violation.code}`);
    state = afterDoubt.state;
    expect(state.phase.kind).toBe("showdown");

    // THE FENCE AGAINST THE TRAP FAMILY (see this describe block's own top
    // comment): the match is NOT over. A two-seat table would make this
    // assertion vacuous; three seats is what makes it a real check.
    expect(getOutcome(state)).toBeNull();
    expect(totalDice(state)).toBe(14); // 15, minus the one die just surrendered

    // THE FIX ITSELF, DRIVEN THROUGH THE REAL DOORS: before task 3.5, this
    // next call returned `null` and the walkthrough could go no further —
    // the exact stall the tasks artifact describes. `forbidden` proves the
    // resolution spends zero entropy while it is at it.
    state = driveOneSystemStep(state, forbidden("showdown resolution needs no entropy — see roll.ts's own docblock"));
    expect(state.phase.kind).toBe("awaiting-roll"); // out of showdown — the table can move again
    expect(getOutcome(state)).toBeNull(); // still not over: three seats, one die down

    // THE NEXT ROUND'S ROLL — reaching this is the whole point of the task:
    // "a match that reaches a doubt must reach the NEXT round's roll without
    // human intervention." A `requestMentirosoSystemAction` still returning
    // `null` for `showdown` would have left `state` stuck two steps back,
    // and `driveOneSystemStep` above would already have thrown.
    state = driveOneSystemStep(state, faceScript([1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 1, 2]));
    expect(state.phase.kind).toBe("bidding");
    expect(totalDice(state)).toBe(14); // a roll redistributes dice, it never spends them
  });
});

/**
 * `mentirosoModule4`/`mentirosoModule6` — the SECOND and THIRD `GameModule`
 * registrations (SDD `mentiroso`, work unit C4/task 3.4), adopting
 * `mentirosoModule`'s own (C3's) fixture SHAPE: every fixture below is sized
 * for ITS OWN registration's seat count, never widened from another one —
 * `mentirosoModule.createMatch` (2 seats) can never reach a 4- or 6-player
 * state, so reusing its fixtures would not be genuinely reachable through
 * THIS registration's own port, the identical reasoning C3's own docblock
 * already recorded for not reusing C2's four-seat `PLAYER_0..PLAYER_3`
 * fixtures.
 */
const FOUR_SEAT_P0 = "c4-4seat-0" as PlayerId;
const FOUR_SEAT_P1 = "c4-4seat-1" as PlayerId;
const FOUR_SEAT_P2 = "c4-4seat-2" as PlayerId;
const FOUR_SEAT_P3 = "c4-4seat-3" as PlayerId;
const FOUR_SEAT_ASSIGNMENTS: readonly SeatAssignment[] = [
  { seat: 0, playerId: FOUR_SEAT_P0 },
  { seat: 1, playerId: FOUR_SEAT_P1 },
  { seat: 2, playerId: FOUR_SEAT_P2 },
  { seat: 3, playerId: FOUR_SEAT_P3 },
];

/** The floor state (design D4's own fixtures note): every seat still alive,
 * `secretsFor` MUST produce a real secret somewhere this registration's own
 * fixtures reach. */
const fourSeatReachableState: MatchState = {
  players: [
    { id: FOUR_SEAT_P0, seat: 0, dice: [5, 2, 6, 1] },
    { id: FOUR_SEAT_P1, seat: 1, dice: [3, 4] },
    { id: FOUR_SEAT_P2, seat: 2, dice: [6, 5, 5] },
    { id: FOUR_SEAT_P3, seat: 3, dice: [1, 2, 3, 4, 5] },
  ],
  phase: { kind: "bidding", turnSeat: 2, bid: { quantity: 3, face: 5 } },
};

/** Same quantity, strictly higher face — one of the raises `getLegalActions`
 * offers seat 2 above. */
const FOUR_SEAT_LEGAL_ACTION: MentirosoModuleAction = { type: "raise", playerId: FOUR_SEAT_P2, bid: { quantity: 3, face: 6 } };

/** Built through the REGISTRATION's own `createMatch` (design D4: the
 * opening draw is public) — a fresh four-seat table is exactly what that
 * function already produces. */
const fourSeatOpeningDrawState: MatchState = mentirosoModule4.createMatch({}, FOUR_SEAT_ASSIGNMENTS);

/** Internally consistent with `showdown.ts`'s own tally rule: three sixes on
 * the table (two on seat 0, one on seat 1) exactly meet a bid of (3, 6), so
 * the bidder (seat 0) wins on "at least" and the doubter (seat 1) surrenders
 * a die. */
const fourSeatShowdownState: MatchState = {
  players: [
    { id: FOUR_SEAT_P0, seat: 0, dice: [6, 6, 2, 4] },
    { id: FOUR_SEAT_P1, seat: 1, dice: [6, 1, 3] },
    { id: FOUR_SEAT_P2, seat: 2, dice: [2, 3, 5] },
    { id: FOUR_SEAT_P3, seat: 3, dice: [4, 5] },
  ],
  phase: { kind: "showdown", bid: { quantity: 3, face: 6 }, doubterSeat: 1, matched: 3, loserSeat: 1, winnerSeat: 0 },
};

/**
 * ONE seat eliminated, three still active — at four seats this is genuinely
 * DISTINCT from `fourSeatTerminalState` below (unlike `mentirosoModule`'s own
 * two seats, where the two coincide): three live seats is nowhere near "the
 * sole seat left holding dice."
 */
const fourSeatMidMatchEliminatedState: MatchState = {
  players: [
    { id: FOUR_SEAT_P0, seat: 0, dice: [3, 5] },
    { id: FOUR_SEAT_P1, seat: 1, dice: [] },
    { id: FOUR_SEAT_P2, seat: 2, dice: [6, 2, 4] },
    { id: FOUR_SEAT_P3, seat: 3, dice: [1, 6] },
  ],
  phase: { kind: "bidding", turnSeat: 2, bid: { quantity: 2, face: 4 } },
};

/** Three seats eliminated, one holding dice — the actual terminal state. */
const fourSeatTerminalState: MatchState = {
  players: [
    { id: FOUR_SEAT_P0, seat: 0, dice: [] },
    { id: FOUR_SEAT_P1, seat: 1, dice: [] },
    { id: FOUR_SEAT_P2, seat: 2, dice: [] },
    { id: FOUR_SEAT_P3, seat: 3, dice: [6, 3] },
  ],
  phase: { kind: "bidding", turnSeat: 3, bid: { quantity: 1, face: 6 } },
};

const FOUR_SEAT_HAND_BUILT_STATES: readonly MatchState[] = [
  fourSeatReachableState,
  fourSeatShowdownState,
  fourSeatMidMatchEliminatedState,
  fourSeatTerminalState,
];

describe("mentirosoModule4 fixtures — this unit's own named risk, checked rather than assumed", () => {
  it("no two players in the same hand-built state share an identical dice array", () => {
    // Eliminated seats are deliberately excluded here: two or more empty
    // arrays coinciding is exactly what the empty-array-exclusion fence
    // (mentiroso-hidden-dice) expects — `secretsFor` never declares an empty
    // array a secret in the first place, so a coincidence between two
    // eliminated seats carries none of the risk this check exists to catch.
    for (const state of FOUR_SEAT_HAND_BUILT_STATES) {
      for (const player of state.players) {
        if (player.dice.length === 0) continue;
        const sameArray = state.players.filter(
          (other) => other.id !== player.id && other.dice.length > 0 && JSON.stringify(other.dice) === JSON.stringify(player.dice),
        );
        expect(sameArray).toEqual([]);
      }
    }
  });

  it("no LIVE player's dice count equals their own seat number, in any hand-built state", () => {
    for (const state of FOUR_SEAT_HAND_BUILT_STATES) {
      for (const player of state.players) {
        if (player.dice.length === 0) continue;
        expect(player.dice.length).not.toBe(player.seat);
      }
    }
  });
});

describeGameModule(
  mentirosoModule4,
  {
    config: {},
    seats: FOUR_SEAT_ASSIGNMENTS,
    playerId: FOUR_SEAT_P2,
    reachableState: fourSeatReachableState,
    legalAction: FOUR_SEAT_LEGAL_ACTION,
    terminalState: fourSeatTerminalState,
    botTier: "normal",
    hiddenStateSamples: [fourSeatOpeningDrawState, fourSeatShowdownState, fourSeatMidMatchEliminatedState],
  },
  { describe, it, expect },
);

describe("what mentirosoModule4 tells the registry", () => {
  it("declares four seats, the dados shelf and its own family", () => {
    expect(mentirosoModule4.metadata).toEqual({
      seatCount: 4,
      gameFamily: "mentiroso",
      section: "dados",
      displayNameKey: "games.mentiroso4.name",
      assetBase: "/games/mentiroso",
    });
    expect(mentirosoModule4.id).toBe("mentiroso-4");
  });
});

describe("the table mentirosoModule4 builds", () => {
  it("refuses to seat one player twice", () => {
    expect(() =>
      mentirosoModule4.createMatch({}, [
        { seat: 0, playerId: FOUR_SEAT_P0 },
        { seat: 1, playerId: FOUR_SEAT_P0 },
        { seat: 2, playerId: FOUR_SEAT_P2 },
        { seat: 3, playerId: FOUR_SEAT_P3 },
      ]),
    ).toThrow(/distinct player/);
  });

  it("refuses a seat list that is not one player at each of its four seats", () => {
    expect(() => mentirosoModule4.createMatch({}, [{ seat: 0, playerId: FOUR_SEAT_P0 }])).toThrow(/seats 0/);
    expect(() => mentirosoModule4.createMatch({}, [...FOUR_SEAT_ASSIGNMENTS, { seat: 4, playerId: "fifth" as PlayerId }])).toThrow(/seats 0/);
  });
});

/**
 * Six seats: the FIRST registration in this whole chain able to carry more
 * than one eliminated seat while the match still continues (with two seats,
 * eliminating the sole rival always ends the match in the same step; with
 * four, only one elimination is unambiguously safe before the table nears
 * its own terminal shape). This registration's own fixtures are built to
 * exercise exactly that opportunity — see this unit's own apply-progress
 * record for the reasoning.
 */
const SIX_SEAT_P0 = "c4-6seat-0" as PlayerId;
const SIX_SEAT_P1 = "c4-6seat-1" as PlayerId;
const SIX_SEAT_P2 = "c4-6seat-2" as PlayerId;
const SIX_SEAT_P3 = "c4-6seat-3" as PlayerId;
const SIX_SEAT_P4 = "c4-6seat-4" as PlayerId;
const SIX_SEAT_P5 = "c4-6seat-5" as PlayerId;
const SIX_SEAT_ASSIGNMENTS: readonly SeatAssignment[] = [
  { seat: 0, playerId: SIX_SEAT_P0 },
  { seat: 1, playerId: SIX_SEAT_P1 },
  { seat: 2, playerId: SIX_SEAT_P2 },
  { seat: 3, playerId: SIX_SEAT_P3 },
  { seat: 4, playerId: SIX_SEAT_P4 },
  { seat: 5, playerId: SIX_SEAT_P5 },
];

/** The floor state: every seat still alive, `secretsFor` MUST produce a real
 * secret somewhere this registration's own fixtures reach. */
const sixSeatReachableState: MatchState = {
  players: [
    { id: SIX_SEAT_P0, seat: 0, dice: [4, 2, 6, 1, 5] },
    { id: SIX_SEAT_P1, seat: 1, dice: [3, 3] },
    { id: SIX_SEAT_P2, seat: 2, dice: [6, 5, 5, 2] },
    { id: SIX_SEAT_P3, seat: 3, dice: [1] },
    { id: SIX_SEAT_P4, seat: 4, dice: [2, 6, 4] },
    { id: SIX_SEAT_P5, seat: 5, dice: [5, 1, 3, 2, 6, 4] },
  ],
  phase: { kind: "bidding", turnSeat: 4, bid: { quantity: 3, face: 5 } },
};

const SIX_SEAT_LEGAL_ACTION: MentirosoModuleAction = { type: "raise", playerId: SIX_SEAT_P4, bid: { quantity: 3, face: 6 } };

/** Built through the REGISTRATION's own `createMatch` — a fresh six-seat
 * table (30 dice, the ruleset's own worked example) is exactly what that
 * function already produces. */
const sixSeatOpeningDrawState: MatchState = mentirosoModule6.createMatch({}, SIX_SEAT_ASSIGNMENTS);

/** Internally consistent with `showdown.ts`'s own tally rule: four sixes on
 * the table (two on seat 0, one on seat 2, one on seat 5) exactly meet a bid
 * of (4, 6), so the bidder (seat 0) wins on "at least" and the doubter (seat
 * 1) surrenders a die. */
const sixSeatShowdownState: MatchState = {
  players: [
    { id: SIX_SEAT_P0, seat: 0, dice: [6, 6, 2, 1] },
    { id: SIX_SEAT_P1, seat: 1, dice: [3, 4, 5] },
    { id: SIX_SEAT_P2, seat: 2, dice: [6, 1, 3] },
    { id: SIX_SEAT_P3, seat: 3, dice: [2, 5, 4, 1] },
    { id: SIX_SEAT_P4, seat: 4, dice: [3, 2] },
    { id: SIX_SEAT_P5, seat: 5, dice: [6, 5, 4, 3] },
  ],
  phase: { kind: "showdown", bid: { quantity: 4, face: 6 }, doubterSeat: 1, matched: 4, loserSeat: 1, winnerSeat: 0 },
};

/**
 * TWO eliminated seats (1 and 4), INTERSPERSED among four still-alive seats
 * (0, 2, 3, 5) rather than trailing at the end — the shape this whole
 * registration is uniquely positioned to reach, and the one the empty-array
 * exclusion trap is easiest to trip against: a leaked-secret scan that only
 * ever saw a trailing empty seat could still miss one sitting in the middle
 * of the table.
 */
const sixSeatMidMatchInterspersedState: MatchState = {
  players: [
    { id: SIX_SEAT_P0, seat: 0, dice: [3, 3, 5] },
    { id: SIX_SEAT_P1, seat: 1, dice: [] },
    { id: SIX_SEAT_P2, seat: 2, dice: [2, 6, 4] },
    { id: SIX_SEAT_P3, seat: 3, dice: [5, 6, 4, 2] },
    { id: SIX_SEAT_P4, seat: 4, dice: [] },
    { id: SIX_SEAT_P5, seat: 5, dice: [1, 3] },
  ],
  phase: { kind: "bidding", turnSeat: 3, bid: { quantity: 2, face: 3 } },
};

/**
 * THREE consecutively eliminated seats (1, 2, 3), three still alive (0, 4,
 * 5) — the fixture behind both the turn-skip test and the shrunk-ceiling
 * test below, since both need the identical depleted table: `nextActiveSeat`
 * jumping several seats in a row is only reachable with three or more
 * consecutive eliminations, and only a six-seat table can hold that many
 * while still leaving more than one seat alive (getOutcome stays null with
 * three seats standing).
 */
const sixSeatDepletedPlayers: MatchState["players"] = [
  { id: SIX_SEAT_P0, seat: 0, dice: [6, 6] },
  { id: SIX_SEAT_P1, seat: 1, dice: [] },
  { id: SIX_SEAT_P2, seat: 2, dice: [] },
  { id: SIX_SEAT_P3, seat: 3, dice: [] },
  { id: SIX_SEAT_P4, seat: 4, dice: [6] },
  { id: SIX_SEAT_P5, seat: 5, dice: [3] },
];

/** A low, easily-raised bid — for the turn-skip test: seat 0 raises, and the
 * next turn must land on seat 4, skipping seats 1, 2 and 3 in one hop. */
const sixSeatTurnSkipState: MatchState = {
  players: sixSeatDepletedPlayers,
  phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 1, face: 1 } },
};

/** The SAME depleted table, at its own ceiling exactly — for the shrunk-
 * ceiling test: total dice is 4 (2 + 1 + 1), so the ceiling is (4, 6), far
 * below the (30, 6) a fresh six-seat table opens at. */
const sixSeatLowCeilingState: MatchState = {
  players: sixSeatDepletedPlayers,
  phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 4, face: 6 } },
};

/** Five seats eliminated, one holding dice — the actual terminal state. */
const sixSeatTerminalState: MatchState = {
  players: [
    { id: SIX_SEAT_P0, seat: 0, dice: [] },
    { id: SIX_SEAT_P1, seat: 1, dice: [] },
    { id: SIX_SEAT_P2, seat: 2, dice: [] },
    { id: SIX_SEAT_P3, seat: 3, dice: [] },
    { id: SIX_SEAT_P4, seat: 4, dice: [] },
    { id: SIX_SEAT_P5, seat: 5, dice: [6, 3] },
  ],
  phase: { kind: "bidding", turnSeat: 5, bid: { quantity: 1, face: 6 } },
};

const SIX_SEAT_HAND_BUILT_STATES: readonly MatchState[] = [
  sixSeatReachableState,
  sixSeatShowdownState,
  sixSeatMidMatchInterspersedState,
  sixSeatTerminalState,
];

describe("mentirosoModule6 fixtures — this unit's own named risk, checked rather than assumed", () => {
  it("no two players in the same hand-built state share an identical dice array", () => {
    // Same exclusion as `mentirosoModule4`'s own version of this check above:
    // two or more eliminated seats sharing the empty array is expected, not a
    // risk — `secretsFor` never declares `[]` a secret to begin with.
    for (const state of SIX_SEAT_HAND_BUILT_STATES) {
      for (const player of state.players) {
        if (player.dice.length === 0) continue;
        const sameArray = state.players.filter(
          (other) => other.id !== player.id && other.dice.length > 0 && JSON.stringify(other.dice) === JSON.stringify(player.dice),
        );
        expect(sameArray).toEqual([]);
      }
    }
  });

  it("no LIVE player's dice count equals their own seat number, in any hand-built state", () => {
    for (const state of SIX_SEAT_HAND_BUILT_STATES) {
      for (const player of state.players) {
        if (player.dice.length === 0) continue;
        expect(player.dice.length).not.toBe(player.seat);
      }
    }
  });
});

describeGameModule(
  mentirosoModule6,
  {
    config: {},
    seats: SIX_SEAT_ASSIGNMENTS,
    playerId: SIX_SEAT_P4,
    reachableState: sixSeatReachableState,
    legalAction: SIX_SEAT_LEGAL_ACTION,
    terminalState: sixSeatTerminalState,
    botTier: "hard",
    hiddenStateSamples: [sixSeatOpeningDrawState, sixSeatShowdownState, sixSeatMidMatchInterspersedState, sixSeatLowCeilingState],
  },
  { describe, it, expect },
);

describe("what mentirosoModule6 tells the registry", () => {
  it("declares six seats, the dados shelf and its own family", () => {
    expect(mentirosoModule6.metadata).toEqual({
      seatCount: 6,
      gameFamily: "mentiroso",
      section: "dados",
      displayNameKey: "games.mentiroso6.name",
      assetBase: "/games/mentiroso",
    });
    expect(mentirosoModule6.id).toBe("mentiroso-6");
  });
});

describe("the table mentirosoModule6 builds", () => {
  it("refuses to seat one player twice", () => {
    expect(() =>
      mentirosoModule6.createMatch({}, [
        { seat: 0, playerId: SIX_SEAT_P0 },
        { seat: 1, playerId: SIX_SEAT_P0 },
        { seat: 2, playerId: SIX_SEAT_P2 },
        { seat: 3, playerId: SIX_SEAT_P3 },
        { seat: 4, playerId: SIX_SEAT_P4 },
        { seat: 5, playerId: SIX_SEAT_P5 },
      ]),
    ).toThrow(/distinct player/);
  });

  it("refuses a seat list that is not one player at each of its six seats", () => {
    expect(() => mentirosoModule6.createMatch({}, [{ seat: 0, playerId: SIX_SEAT_P0 }])).toThrow(/seats 0/);
    expect(() => mentirosoModule6.createMatch({}, [...SIX_SEAT_ASSIGNMENTS, { seat: 6, playerId: "seventh" as PlayerId }])).toThrow(/seats 0/);
  });
});

describe("mentirosoModule6 — the more-than-one-eliminated-seat opportunity (SDD mentiroso, work unit C4/task 3.4)", () => {
  it("THE FENCE, with eliminated seats INTERSPERSED rather than trailing: excludes seats 1 and 4 while still reporting real secrets for the seats still alive", () => {
    const secretsAtSeat1 = mentirosoModule6.hiddenState.kind === "hidden-per-seat" ? mentirosoModule6.hiddenState.secretsFor(sixSeatMidMatchInterspersedState, SIX_SEAT_P1) : [];
    expect(secretsAtSeat1).not.toContainEqual([]);
    expect(secretsAtSeat1.length).toBeGreaterThan(0); // seat 1 still sees real secrets from seats 0, 2, 3, 5

    const leaks = SIX_SEAT_ASSIGNMENTS.flatMap((assignment) => {
      const secrets = mentirosoModule6.hiddenState.kind === "hidden-per-seat" ? mentirosoModule6.hiddenState.secretsFor(sixSeatMidMatchInterspersedState, assignment.playerId) : [];
      const leaked = findLeakedSecrets(mentirosoModule6.getViewFor(sixSeatMidMatchInterspersedState, assignment.playerId), secrets);
      return leaked.length === 0 ? [] : [{ leakedTo: assignment.playerId, leaked }];
    });
    expect(leaks).toEqual([]);
  });

  it("nextActiveSeat skips THREE consecutive eliminated seats in one hop, driven through the full applyAction path", () => {
    const legal = getLegalActions(sixSeatTurnSkipState, SIX_SEAT_P0).find((action) => action.type === "raise");
    if (legal === undefined) throw new Error("expected at least one legal raise for seat 0");
    const result = applyAction(sixSeatTurnSkipState, legal);
    if (!result.ok) throw new Error(`the raise was refused: ${result.violation.code}`);
    expect(result.state.phase).toEqual({ kind: "bidding", turnSeat: 4, bid: legal.bid });
  });

  it("the ceiling shrinks from (30, 6) at a fresh table to (4, 6) once four of six seats are eliminated", () => {
    expect(ceilingFor(sixSeatOpeningDrawState)).toEqual({ quantity: 30, face: 6 });
    expect(ceilingFor(sixSeatLowCeilingState)).toEqual({ quantity: 4, face: 6 });
  });

  it("at that shrunk ceiling, only doubt is offered — the same forced move the ruleset names, now measured at its lower end", () => {
    const legal = getLegalActions(sixSeatLowCeilingState, SIX_SEAT_P0);
    expect(legal).toEqual([{ type: "doubt", playerId: SIX_SEAT_P0 }]);
  });
});
