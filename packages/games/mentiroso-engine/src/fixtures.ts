import type { MatchState, PlayerId } from "./state.js";

/**
 * Reusable states for `view.ts`'s own tests (SDD `mentiroso`, work unit
 * B5/task 2.5) — later reused, not rebuilt, by `mentiroso-module`'s own
 * conformance fixtures (Phase 3, work units 3.3/3.4), the same "shared not
 * copied" discipline `sdd/mentiroso/design`'s own D4 already states for
 * `secretsFor` itself. Named `reachableState`/`hiddenStateSamples` on
 * purpose — the exact field names `GameModuleFixtures`
 * (`packages/platform-contract/src/conformance.ts`) already uses, so a later
 * unit can spread this file's own exports straight into its own fixture
 * object instead of rebuilding the same states a second time.
 *
 * NEVER BARRELLED (`sdd/mentiroso/design`'s own File Changes table): this is
 * test data, not this package's public API, and `index.ts` deliberately does
 * not re-export it.
 *
 * EVERY STATE BELOW IS BUILT SO NO TWO READINGS COINCIDE (`AGENTS.md`'s own
 * "fixtures donde las lecturas discrepen"): no seat's dice COUNT equals its
 * own seat index, no two seats in the same state share the same dice ARRAY,
 * and none of a state's seats holds the same dice as any other seat in that
 * same state — so a bug that swapped one rival's array for another's, or that
 * mistook a dice count for a seat number, cannot hide behind a coincidence.
 */

const PLAYER_AT_SEAT_0 = "seat-0-player" as PlayerId;
const PLAYER_AT_SEAT_1 = "seat-1-player" as PlayerId;
const PLAYER_AT_SEAT_2 = "seat-2-player" as PlayerId;
const PLAYER_AT_SEAT_3 = "seat-3-player" as PlayerId;

/** Index-aligned with seat number — `SEAT_PLAYER_IDS[2]` is always the
 * `playerId` seated at seat 2, across every state this file exports. */
export const SEAT_PLAYER_IDS: readonly PlayerId[] = [PLAYER_AT_SEAT_0, PLAYER_AT_SEAT_1, PLAYER_AT_SEAT_2, PLAYER_AT_SEAT_3];

/**
 * A bidding-phase, 4-seat match, nobody eliminated — the floor state design
 * D4's own fixtures note requires: `secretsFor` MUST produce a real secret
 * somewhere its fixtures reach, and this is the state that holds one for
 * every seat's own view of every other seat.
 */
export const reachableState: MatchState = {
  players: [
    { id: PLAYER_AT_SEAT_0, seat: 0, dice: [2, 4, 6] },
    { id: PLAYER_AT_SEAT_1, seat: 1, dice: [5, 5, 1, 3] },
    { id: PLAYER_AT_SEAT_2, seat: 2, dice: [6, 2, 3, 4, 1] },
    { id: PLAYER_AT_SEAT_3, seat: 3, dice: [3] },
  ],
  phase: { kind: "bidding", turnSeat: 1, bid: { quantity: 5, face: 3 } },
};

/**
 * `secretsFor` MUST return no secrets here (design D4: the opening draw is
 * public) — the draw's own faces live on `phase.lastFaces`, never on a
 * per-seat `dice` field, which nobody reads until the round's first real roll
 * (see `state.ts`'s own `createMatch` docblock). Every seat still carries
 * `createMatch`'s own placeholder dice, identical for every seat on purpose:
 * this state has no per-round roll yet, so there is nothing seat-specific to
 * redact even if a bug tried to.
 */
export const openingDrawState: MatchState = {
  players: [
    { id: PLAYER_AT_SEAT_0, seat: 0, dice: [1, 1, 1, 1, 1] },
    { id: PLAYER_AT_SEAT_1, seat: 1, dice: [1, 1, 1, 1, 1] },
    { id: PLAYER_AT_SEAT_2, seat: 2, dice: [1, 1, 1, 1, 1] },
    { id: PLAYER_AT_SEAT_3, seat: 3, dice: [1, 1, 1, 1, 1] },
  ],
  phase: { kind: "opening-draw", contenders: [0, 1, 2, 3], lastFaces: [] },
};

/**
 * `secretsFor` MUST return no secrets here either (design D4: the reveal IS
 * the rule) — every seat's ACTUAL dice, post-surrender, become visible to
 * every seat once a showdown resolves. Bid (5,3)? No — a fresh bid/tally pair
 * consistent with its own dice: three 6s on the table (two on seat 0, one on
 * seat 1) exactly meet a bid of (3, 6), so the bidder (seat 0) wins on
 * "at least" and the doubter (seat 1) surrenders — matching `showdown.ts`'s
 * own `applyDoubt` rule this state does not call but must stay consistent
 * with for a reviewer to trust it.
 */
export const showdownState: MatchState = {
  players: [
    { id: PLAYER_AT_SEAT_0, seat: 0, dice: [2, 6, 6] },
    { id: PLAYER_AT_SEAT_1, seat: 1, dice: [6, 5, 1] },
    { id: PLAYER_AT_SEAT_2, seat: 2, dice: [3, 4, 2, 5] },
    { id: PLAYER_AT_SEAT_3, seat: 3, dice: [1] },
  ],
  phase: { kind: "showdown", bid: { quantity: 3, face: 6 }, doubterSeat: 1, matched: 3, loserSeat: 1, winnerSeat: 0 },
};

/**
 * A bidding-phase, mid-match state with seat 2 eliminated (`dice: []`) — the
 * fixture the empty-array exclusion requirement (mentiroso-hidden-dice) needs:
 * a real eliminated seat sitting alongside real secrets for the seats still
 * active, so the exclusion has something to filter FROM, not an empty table.
 */
export const midMatchEliminatedState: MatchState = {
  players: [
    { id: PLAYER_AT_SEAT_0, seat: 0, dice: [4, 4, 6] },
    { id: PLAYER_AT_SEAT_1, seat: 1, dice: [2, 5] },
    { id: PLAYER_AT_SEAT_2, seat: 2, dice: [] },
    { id: PLAYER_AT_SEAT_3, seat: 3, dice: [5, 6, 5, 2] },
  ],
  phase: { kind: "bidding", turnSeat: 3, bid: { quantity: 3, face: 4 } },
};

/**
 * `GameModuleFixtures.hiddenStateSamples`-shaped, by NAME (design D4's own
 * fixtures note): one state per non-bidding secret rule this requirement set
 * names, plus the elimination edge case — so `mentiroso-module`'s own
 * conformance fixtures (Phase 3) can spread this array straight into their
 * own `hiddenStateSamples` instead of rebuilding the same three states.
 */
export const hiddenStateSamples: readonly MatchState[] = [openingDrawState, showdownState, midMatchEliminatedState];
