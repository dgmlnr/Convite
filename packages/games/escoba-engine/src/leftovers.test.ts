import { describe, expect, it } from "vitest";
import { settleLeftovers } from "./escoba.js";
import type { Card, Suit, Rank } from "./card.js";
import type { MatchState, Player, Team, HandState } from "./state.js";
import type { PlayerId, TeamId } from "./ids.js";

// Leftover table cards at hand end — art. 15 gives only the ARITHMETIC (the
// 40 cards total 220 = 14x15 + 10, so leftovers always sum to at least 10)
// and never says who takes them. Adopted from pagat BY ABSENCE of a local
// rule (see `escoba/reglas-verificadas`, design's "Open Questions" #1): the
// LAST team that captured takes them, and it is explicitly NOT an escoba.

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

const PLAYER_0 = "player-0" as PlayerId;
const PLAYER_1 = "player-1" as PlayerId;
const TEAM_A = "team-a" as TeamId;
const TEAM_B = "team-b" as TeamId;

/** Builds a match already AT hand-end: stock empty, both hands empty, some
 * cards still on the table, and a given `lastCapturer` — the state
 * `settleLeftovers` is meant to receive once its caller has recognized hand
 * end (a later unit's concern; this function only performs the transfer). */
function fixtureHandEnd(table: readonly Card[], lastCapturer: TeamId | null): MatchState {
  const players: readonly Player[] = [
    { id: PLAYER_0, teamId: TEAM_A, seat: 0, hand: [] },
    { id: PLAYER_1, teamId: TEAM_B, seat: 1, hand: [] },
  ];
  const teams: readonly [Team, Team] = [
    { id: TEAM_A, playerIds: [PLAYER_0], score: 0 },
    { id: TEAM_B, playerIds: [PLAYER_1], score: 0 },
  ];
  const hand: HandState = {
    table,
    stock: [],
    piles: { [TEAM_A]: [card(3, "espada")], [TEAM_B]: [card(4, "basto")] },
    escobas: { [TEAM_A]: 1, [TEAM_B]: 0 },
    turn: PLAYER_0,
    lastCapturer,
    outcome: null,
  };
  // dealerSeat is TEAM_A's seat (0) — deliberately DIFFERENT from
  // lastCapturer (TEAM_B) in the primary test below, so the mutation that
  // hands leftovers to the dealer instead is actually distinguishable.
  return { teams, players, dealerSeat: 0, hand, pointsToWin: 30 };
}

describe("settleLeftovers — leftover table cards at hand end (art. 15 + pagat, by absence of a local rule)", () => {
  it("gives the leftover table cards to the LAST TEAM THAT CAPTURED, and does NOT record it as an escoba", () => {
    // leftover arithmetic (art. 15): 40 cards sum to 220 = 14*15 + 10, so a
    // fully-played hand always leaves at least 10 points on the table.
    const leftovers = [card(4, "oro"), card(6, "copa")]; // sums to 10
    const state = fixtureHandEnd(leftovers, TEAM_B); // dealer is TEAM_A; last capturer is TEAM_B

    const result = settleLeftovers(state);

    expect(result.hand!.table).toEqual([]);
    expect(result.hand!.piles[TEAM_B]).toEqual([card(4, "basto"), ...leftovers]);
    expect(result.hand!.piles[TEAM_A]).toEqual([card(3, "espada")]); // untouched
    // NOT an escoba: the escobas record is unchanged by the leftover transfer.
    expect(result.hand!.escobas[TEAM_A]).toBe(1);
    expect(result.hand!.escobas[TEAM_B]).toBe(0);
  });

  it("is a no-op when the table is already empty", () => {
    const state = fixtureHandEnd([], TEAM_A);
    expect(settleLeftovers(state)).toEqual(state);
  });

  it("is a no-op when there is no hand in progress", () => {
    const state: MatchState = { ...fixtureHandEnd([], TEAM_A), hand: null };
    expect(settleLeftovers(state)).toEqual(state);
  });

  it("leaves the leftovers in place when nobody has captured this hand at all (lastCapturer === null) — a later unit's scoring pass decides, not a guess here", () => {
    const state = fixtureHandEnd([card(4, "oro"), card(6, "copa")], null);
    expect(settleLeftovers(state)).toEqual(state);
  });
});
