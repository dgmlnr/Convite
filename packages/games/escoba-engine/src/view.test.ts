import { describe, expect, it } from "vitest";
import { deal } from "./deal.js";
import { buildDeck } from "./deck.js";
import { getViewFor } from "./view.js";
import type { MatchState, Player, Team } from "./state.js";
import type { PlayerId, TeamId } from "./ids.js";

function fixtureMatch(seatCount: 2 | 4): MatchState {
  const teamAId = "team-a" as TeamId;
  const teamBId = "team-b" as TeamId;
  const playerIds = Array.from({ length: seatCount }, (_, seat) => `player-${seat}` as PlayerId);
  const teams: readonly [Team, Team] =
    seatCount === 2
      ? [
          { id: teamAId, playerIds: [playerIds[0]!], score: 0 },
          { id: teamBId, playerIds: [playerIds[1]!], score: 0 },
        ]
      : [
          { id: teamAId, playerIds: [playerIds[0]!, playerIds[2]!], score: 0 },
          { id: teamBId, playerIds: [playerIds[1]!, playerIds[3]!], score: 0 },
        ];
  const players: readonly Player[] = playerIds.map((id, seat) => ({
    id,
    teamId: seat % 2 === 0 ? teamAId : teamBId,
    seat,
    hand: [],
  }));
  return { teams, players, dealerSeat: 0, hand: null, pointsToWin: 30 };
}

describe("getViewFor (design §D2 — stockCount, never stock)", () => {
  it("exposes stockCount equal to the real stock size, and PlayerView carries no stock field", () => {
    const state = deal(fixtureMatch(2), buildDeck());
    const view = getViewFor(state, state.players[0]!.id);
    expect(view.hand?.stockCount).toBe(state.hand!.stock.length);
    expect(view.hand).not.toHaveProperty("stock");
  });

  it("never lets a stock card's identity reach the view, in ANY field — JSON scan (design's mutation row 6)", () => {
    const state = deal(fixtureMatch(4), buildDeck());
    const view = getViewFor(state, state.players[0]!.id);
    const serialized = JSON.stringify(view);
    for (const stockCard of state.hand!.stock) {
      expect(serialized).not.toContain(JSON.stringify(stockCard));
    }
  });

  it("shows every other player's card COUNT only, never their hand contents", () => {
    const state = deal(fixtureMatch(2), buildDeck());
    const view = getViewFor(state, state.players[0]!.id);
    expect(view.others).toHaveLength(1);
    expect(view.others[0]!.cardsRemaining).toBe(3);
    expect(view.others[0]).not.toHaveProperty("hand");
  });

  it("keeps the table, piles, escobas and dealer seat public", () => {
    const state = deal(fixtureMatch(2), buildDeck());
    const view = getViewFor(state, state.players[0]!.id);
    expect(view.hand?.table).toEqual(state.hand!.table);
    expect(view.hand?.piles).toEqual(state.hand!.piles);
    expect(view.hand?.escobas).toEqual(state.hand!.escobas);
    expect(view.dealerSeat).toBe(state.dealerSeat);
  });

  it("exposes outcome null for a hand still in progress, and the full breakdown once decided (slice R1)", () => {
    const state = deal(fixtureMatch(2), buildDeck());
    const inProgress = getViewFor(state, state.players[0]!.id);
    expect(inProgress.hand?.outcome).toBeNull();

    const teamAId = state.teams[0].id;
    const decidedState: MatchState = {
      ...state,
      hand: { ...state.hand!, outcome: { decided: true, breakdown: { cartas: { winner: teamAId }, oros: { winner: null }, setenta: { winner: null }, sieteDeOro: { winner: null }, escobas: state.hand!.escobas, points: { [teamAId]: 1, [state.teams[1].id]: 0 } } } },
    };
    const decided = getViewFor(decidedState, state.players[0]!.id);
    expect(decided.hand?.outcome?.decided).toBe(true);
    if (decided.hand?.outcome?.decided !== true) return;
    expect(decided.hand.outcome.breakdown.cartas.winner).toBe(teamAId);
  });

  it("throws for an unknown player id", () => {
    const state = deal(fixtureMatch(2), buildDeck());
    expect(() => getViewFor(state, "nobody" as PlayerId)).toThrow();
  });
});
