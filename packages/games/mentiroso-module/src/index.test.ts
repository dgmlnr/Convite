import { describe, expect, it } from "vitest";
import { findLeakedSecrets } from "@hexdev/platform-contract";
import { createMatch, getViewFor, secretsFor } from "@hexdev/mentiroso-engine";
import type { MatchState, PlayerId } from "@hexdev/mentiroso-engine";
import { SYSTEM_ACTOR_ID as ROLL_SYSTEM_ACTOR_ID, requestMentirosoSystemAction as rollRequestMentirosoSystemAction } from "./roll.js";
import { SYSTEM_ACTOR_ID, mentirosoHiddenState, requestMentirosoSystemAction } from "./index.js";

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
