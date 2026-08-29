import type { Card, HandState, MatchState, Player, Rank, Suit, Team, TeamId, PlayerId } from "@hexdev/escoba-engine";

export function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

/**
 * Same shape as `escoba-engine/src/capture.test.ts`'s own `fixtureMatch` —
 * this package validates bot DECISIONS, not the reducer, so a hand-built
 * mid-hand state (never routed through `deal()`) is exactly right here too.
 */
export function fixtureMatch(options: {
  table: readonly Card[];
  hand0: readonly Card[];
  hand1: readonly Card[];
  pile0?: readonly Card[];
  pile1?: readonly Card[];
  turn?: PlayerId;
}): { state: MatchState; player0: PlayerId; team0: TeamId; team1: TeamId } {
  const player0 = "player-0" as PlayerId;
  const player1 = "player-1" as PlayerId;
  const team0 = "team-a" as TeamId;
  const team1 = "team-b" as TeamId;
  const players: readonly Player[] = [
    { id: player0, teamId: team0, seat: 0, hand: options.hand0 },
    { id: player1, teamId: team1, seat: 1, hand: options.hand1 },
  ];
  const teams: readonly [Team, Team] = [
    { id: team0, playerIds: [player0], score: 0 },
    { id: team1, playerIds: [player1], score: 0 },
  ];
  const hand: HandState = {
    table: options.table,
    stock: [],
    piles: { [team0]: options.pile0 ?? [], [team1]: options.pile1 ?? [] },
    escobas: { [team0]: 0, [team1]: 0 },
    turn: options.turn ?? player0,
    lastCapturer: null,
    outcome: null,
  };
  return { state: { teams, players, dealerSeat: 0, hand, pointsToWin: 30 }, player0, team0, team1 };
}
