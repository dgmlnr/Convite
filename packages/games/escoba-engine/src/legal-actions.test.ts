import { describe, expect, it } from "vitest";
import { getLegalActions } from "./legal-actions.js";
import type { Card, Rank, Suit } from "./card.js";
import type { HandState, MatchState, Player, Team } from "./state.js";
import type { PlayerId, TeamId } from "./ids.js";

// design §D4/M. One action per (hand card x valid summing subset); a card
// with no valid subset gets exactly ONE stay-on-table action instead of
// zero — capture and stay-on-table are MUTUALLY EXCLUSIVE per played card,
// the same invariant `capture.ts`'s `applyAction` enforces. This is the
// option space `BotStrategy.chooseAction` (`conformance.ts:105-111`) and
// the wire payload (`match-room.ts:1211-1223`, `viewMessageFor`) both read.

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

const PLAYER_0 = "player-0" as PlayerId;
const PLAYER_1 = "player-1" as PlayerId;
const TEAM_A = "team-a" as TeamId;
const TEAM_B = "team-b" as TeamId;

function fixtureMatch(options: { table: readonly Card[]; hand0: readonly Card[]; hand1?: readonly Card[]; turn?: PlayerId }): MatchState {
  const players: readonly Player[] = [
    { id: PLAYER_0, teamId: TEAM_A, seat: 0, hand: options.hand0 },
    { id: PLAYER_1, teamId: TEAM_B, seat: 1, hand: options.hand1 ?? [] },
  ];
  const teams: readonly [Team, Team] = [
    { id: TEAM_A, playerIds: [PLAYER_0], score: 0 },
    { id: TEAM_B, playerIds: [PLAYER_1], score: 0 },
  ];
  const hand: HandState = {
    table: options.table,
    stock: [],
    piles: { [TEAM_A]: [], [TEAM_B]: [] },
    escobas: { [TEAM_A]: 0, [TEAM_B]: 0 },
    turn: options.turn ?? PLAYER_0,
    lastCapturer: null,
    outcome: null,
  };
  return { teams, players, dealerSeat: 0, hand, pointsToWin: 30 };
}

describe("getLegalActions — enumeration (design §D4/M)", () => {
  it("emits one action per valid summing subset, in canonical table-index order", () => {
    // table has TWO disjoint subsets summing to 8 (target for a played 7):
    // {idx0, idx3} = 2+6 and {idx1, idx2} = 3+5. The canonical DFS walk
    // (include index i before excluding it, i ascending) always visits
    // {idx0, idx3} before {idx1, idx2} for this exact table — see
    // `legal-actions.ts`'s own doc comment for the walk order.
    const table = [card(2, "espada"), card(3, "basto"), card(5, "oro"), card(6, "copa")];
    const state = fixtureMatch({ table, hand0: [card(7, "espada")] });

    const actions = getLegalActions(state, PLAYER_0);

    expect(actions).toEqual([
      { type: "play-card", playerId: PLAYER_0, card: card(7, "espada"), captured: [table[0], table[3]] },
      { type: "play-card", playerId: PLAYER_0, card: card(7, "espada"), captured: [table[1], table[2]] },
    ]);
  });

  it("emits exactly ONE stay-on-table action when a card forms no 15 with any subset", () => {
    const table = [card(2, "oro")]; // 15 - 7 = 8, unreachable from a lone 2
    const state = fixtureMatch({ table, hand0: [card(7, "espada")] });

    const actions = getLegalActions(state, PLAYER_0);

    expect(actions).toEqual([{ type: "play-card", playerId: PLAYER_0, card: card(7, "espada"), captured: [] }]);
  });

  it("a hand of ONLY dead cards still returns one action per card, never empty", () => {
    // an all-even table: even hand cards need an ODD target (15 - even),
    // which an all-even table's sums can never reach
    // (`escoba/invariante-de-paridad-de-la-mesa`) — every card here is
    // dead, and the list must still hold exactly one action per card.
    // Without this, a player holding only dead cards could not move and
    // the room would hang with no error.
    const table = [card(2, "espada"), card(4, "basto"), card(6, "oro")];
    const state = fixtureMatch({ table, hand0: [card(2, "copa"), card(4, "espada")] });

    const actions = getLegalActions(state, PLAYER_0);

    expect(actions).toHaveLength(2);
    expect(actions.every((action) => action.captured.length === 0)).toBe(true);
  });

  it("never offers both a capture AND a stay-on-table action for the same card", () => {
    const table = [card(5, "oro"), card(7, "copa")]; // 5+7=12: only an odd played card can reach it
    const state = fixtureMatch({ table, hand0: [card(3, "espada"), card(2, "basto")] });

    const actions = getLegalActions(state, PLAYER_0);

    const forThree = actions.filter((action) => action.card.rank === 3);
    const forTwo = actions.filter((action) => action.card.rank === 2);
    expect(forThree).toEqual([{ type: "play-card", playerId: PLAYER_0, card: card(3, "espada"), captured: [table[0], table[1]] }]);
    expect(forTwo).toEqual([{ type: "play-card", playerId: PLAYER_0, card: card(2, "basto"), captured: [] }]);
  });

  it("returns no actions when no hand is in progress", () => {
    const state = fixtureMatch({ table: [], hand0: [card(3, "espada")] });
    const noHand: MatchState = { ...state, hand: null };

    expect(getLegalActions(noHand, PLAYER_0)).toEqual([]);
  });

  it("returns no actions for a player who is not on turn", () => {
    const state = fixtureMatch({ table: [], hand0: [card(3, "espada")], hand1: [card(4, "oro")], turn: PLAYER_0 });

    expect(getLegalActions(state, PLAYER_1)).toEqual([]);
  });
});
