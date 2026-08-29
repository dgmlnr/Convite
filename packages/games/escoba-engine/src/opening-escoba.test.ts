import { describe, expect, it } from "vitest";
import { applyOpeningEscoba } from "./escoba.js";
import type { Card, Suit, Rank } from "./card.js";
import type { MatchState, Player, Team, HandState } from "./state.js";
import type { PlayerId, TeamId } from "./ids.js";

// Escoba de muestra (art. 16.1 / 16.2) — see `escoba/reglas-verificadas` and
// design §D5. HAND-BUILT openings, never a random deal: art. 16.2's double
// escoba only fires on a PARTITION of the four opening cards into two
// disjoint 15-subsets, a shape a shuffled deal almost never produces. A
// suite that only deals randomly would pass forever without ever exercising
// it (design mutation row 12, "the sharpest row in the whole table").

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

const PLAYER_0 = "player-0" as PlayerId;
const PLAYER_1 = "player-1" as PlayerId;
const TEAM_A = "team-a" as TeamId;
const TEAM_B = "team-b" as TeamId;

/** Builds a match with the opening table already dealt (`hand.table` set
 * explicitly) — this unit validates escoba-de-muestra detection against a
 * GIVEN table, not the dealing pipeline itself (`deal.ts`, Unit D). */
function fixtureMatch(table: readonly Card[], dealerSeat: 0 | 1 = 0): MatchState {
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
    piles: { [TEAM_A]: [], [TEAM_B]: [] },
    escobas: { [TEAM_A]: 0, [TEAM_B]: 0 },
    turn: PLAYER_0,
    lastCapturer: null,
    outcome: null,
  };
  return { teams, players, dealerSeat, hand, pointsToWin: 30 };
}

describe("applyOpeningEscoba — escoba de muestra (art. 16.1 / 16.2)", () => {
  it("VOIDS both escobas when the opening table PARTITIONS into two disjoint 15-subsets — 7+8=15 AND 6+9=15 (art. 16.2, the double escoba)", () => {
    // hand-built {7,8,6,9} by VALUE: 7 (rank 7) + sota (rank 10, value 8) = 15;
    // 6 (rank 6) + caballo (rank 11, value 9) = 15. Sums to 30 overall.
    const table = [card(7, "espada"), card(10, "basto"), card(6, "oro"), card(11, "copa")];
    const state = fixtureMatch(table, 0);

    const result = applyOpeningEscoba(state);

    // "no se anotará ninguna de las dos escobas" — neither team scores.
    expect(result.hand!.escobas[TEAM_A]).toBe(0);
    expect(result.hand!.escobas[TEAM_B]).toBe(0);
    // a reading, not a quote (design §D5): the double escoba is NOT swept,
    // only its scoring is void — the four cards stay on the table.
    expect(result.hand!.table).toEqual(table);
    expect(result.hand!.piles[TEAM_A]).toEqual([]);
    expect(result.hand!.piles[TEAM_B]).toEqual([]);
    expect(result.hand!.lastCapturer).toBeNull();
  });

  it("sweeps the table and scores ONE escoba for the DEALER's team when the opening table sums to exactly 15 (art. 16.1, single escoba)", () => {
    // hand-built single 15: 1 + 2 + 5 + 7 = 15. No other 15-subset exists,
    // so the double-escoba branch cannot fire here.
    const table = [card(1, "espada"), card(2, "basto"), card(5, "oro"), card(7, "copa")];
    const state = fixtureMatch(table, 0); // dealer is seat 0 = PLAYER_0 = TEAM_A

    const result = applyOpeningEscoba(state);

    expect(result.hand!.table).toEqual([]);
    expect(result.hand!.piles[TEAM_A]).toEqual(table);
    expect(result.hand!.piles[TEAM_B]).toEqual([]);
    expect(result.hand!.escobas[TEAM_A]).toBe(1);
    expect(result.hand!.escobas[TEAM_B]).toBe(0);
    expect(result.hand!.lastCapturer).toBe(TEAM_A);
  });

  it("credits the escoba to the dealer's team specifically, not always the same team — dealer seat 1 sweeps for TEAM_B", () => {
    const table = [card(1, "espada"), card(2, "basto"), card(5, "oro"), card(7, "copa")];
    const state = fixtureMatch(table, 1); // dealer is seat 1 = PLAYER_1 = TEAM_B

    const result = applyOpeningEscoba(state);

    expect(result.hand!.escobas[TEAM_B]).toBe(1);
    expect(result.hand!.escobas[TEAM_A]).toBe(0);
    expect(result.hand!.lastCapturer).toBe(TEAM_B);
  });

  it("does NOTHING special for an opening that sums to 30 but has NO 15+15 partition — the distinction is PARTITION, not sum-to-30 (design row 12)", () => {
    // hand-built {10,10,9,1} by VALUE: rey (rank 12, value 10) x2 + caballo
    // (rank 11, value 9) + 1 (rank 1, value 1) = 30. No subset of these four
    // sums to exactly 15 (checked exhaustively: 20,19,11,10,29,21,20,20 —
    // none hit 15), so there was never an escoba here at all.
    const table = [card(12, "espada"), card(12, "basto"), card(11, "oro"), card(1, "copa")];
    const state = fixtureMatch(table, 0);

    const result = applyOpeningEscoba(state);

    expect(result.hand!.table).toEqual(table);
    expect(result.hand!.piles[TEAM_A]).toEqual([]);
    expect(result.hand!.piles[TEAM_B]).toEqual([]);
    expect(result.hand!.escobas[TEAM_A]).toBe(0);
    expect(result.hand!.escobas[TEAM_B]).toBe(0);
    expect(result.hand!.lastCapturer).toBeNull();
  });

  it("is a no-op when there is no hand in progress", () => {
    const state: MatchState = { ...fixtureMatch([]), hand: null };
    expect(applyOpeningEscoba(state)).toEqual(state);
  });
});
