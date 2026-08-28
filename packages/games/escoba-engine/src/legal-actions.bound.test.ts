import { describe, expect, it } from "vitest";
import { applyAction } from "./capture.js";
import { getLegalActions } from "./legal-actions.js";
import { cardId } from "./card.js";
import type { Card, Rank, Suit } from "./card.js";
import type { HandState, MatchState, Player, Team } from "./state.js";
import type { PlayerId, TeamId } from "./ids.js";

// design §M1/M2/M3, `escoba/invariante-de-paridad-de-la-mesa`. The table's
// worst case is NOT its largest possible size (20, all-even — a structural
// parity ceiling: for an even card `15 - v` is odd and unreachable from an
// all-even table, so all 20 even cards are simultaneously dead) — it is
// where a FULL hand meets the largest table the turn order can actually
// reach. MEASURED, not guessed: 942 actions for a 4-seat match (this
// fixture), 882 for 2-seat; independently re-derived by the orchestrator
// with its own script. This bound is an ASSERTION, never a truncation —
// `getLegalActions` does not cap its own output; if a rules change ever
// moves the ceiling, this test says so instead of silently truncating.

const SUITS: readonly Suit[] = ["espada", "basto", "oro", "copa"];

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

const PLAYER_0 = "player-0" as PlayerId;
const PLAYER_1 = "player-1" as PlayerId;
const TEAM_A = "team-a" as TeamId;
const TEAM_B = "team-b" as TeamId;

function fixtureMatch(table: readonly Card[], hand0: readonly Card[]): MatchState {
  const players: readonly Player[] = [
    { id: PLAYER_0, teamId: TEAM_A, seat: 0, hand: hand0 },
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
  return { teams, players, dealerSeat: 0, hand, pointsToWin: 30 };
}

// {2,4,6,8}x4 by VALUE (rank 10 = sota = value 8) + three 10s by VALUE (rank
// 12 = rey = value 10) — the exact worst-case construction design §M2
// derives for a 4-seat match: round 1 deals the twelve remaining
// {2,4,6,8}-valued cards as dead stay-on-table plays (table 4 -> 16), round
// 2 deals P1/P2/P3 each a rey, also played dead (table -> 17, 18, 19), and
// P4 is left on turn holding the three aces — the best possible hand,
// since an ace's target (14) is the largest.
const EVEN_RANKS: readonly Rank[] = [2, 4, 6, 10];
const WORST_CASE_TABLE: readonly Card[] = [
  ...EVEN_RANKS.flatMap((rank) => SUITS.map((suit) => card(rank, suit))), // 16 cards
  ...SUITS.slice(0, 3).map((suit) => card(12, suit)), // 3 reys, value 10
];
const THREE_ACES: readonly Card[] = SUITS.slice(0, 3).map((suit) => card(1, suit));

describe("getLegalActions — the M bound (design §M, measured worst case 942)", () => {
  it("stays at or under 1000 actions for the hand-built 19-card all-even table against a 3-ace hand", () => {
    expect(WORST_CASE_TABLE).toHaveLength(19);

    const state = fixtureMatch(WORST_CASE_TABLE, THREE_ACES);
    const actions = getLegalActions(state, PLAYER_0);

    expect(actions.length).toBeLessThanOrEqual(1000);
  });

  it("stays bounded immediately after two real captures from the worst-case table (guards the capture-must-shrink-the-table invariant, mutation row 9)", () => {
    let state = fixtureMatch(WORST_CASE_TABLE, THREE_ACES);

    // Two REAL captures via applyAction — this only stays bounded because a
    // capture actually REMOVES both the captured subset and the played
    // card from the table (capture.ts). A capture that failed to do so
    // would let the table grow PAST its structural 20-card ceiling within
    // a couple of plays instead of shrinking (design §D9 row 9).
    for (const ace of THREE_ACES.slice(0, 2)) {
      const offer = getLegalActions(state, PLAYER_0).find((action) => cardId(action.card) === cardId(ace));
      if (offer === undefined) throw new Error("fixture error: an ace must have a capturing subset against this table");
      const result = applyAction(state, offer);
      if (!result.ok) throw new Error("fixture error: the subset getLegalActions offered must itself be legal");
      state = result.state;
    }

    expect(state.hand!.table.length).toBeLessThanOrEqual(19);
    expect(getLegalActions(state, PLAYER_0).length).toBeLessThanOrEqual(1000);
  });
});
