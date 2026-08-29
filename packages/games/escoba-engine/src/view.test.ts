import { describe, expect, it } from "vitest";
import { deal } from "./deal.js";
import { getViewFor } from "./view.js";
import type { MatchState, Player, Team } from "./state.js";
import type { PlayerId, TeamId } from "./ids.js";

function fixedRng(values: readonly number[]) {
  let i = 0;
  return () => values[i++ % values.length]!;
}

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
    const state = deal(fixtureMatch(2), fixedRng([0.31, 0.62, 0.05, 0.77, 0.44, 0.9, 0.13, 0.22, 0.55, 0.66, 0.08, 0.99]));
    const view = getViewFor(state, state.players[0]!.id);
    expect(view.hand?.stockCount).toBe(state.hand!.stock.length);
    expect(view.hand).not.toHaveProperty("stock");
  });

  it("never lets a stock card's identity reach the view, in ANY field — JSON scan (design's mutation row 6)", () => {
    const state = deal(fixtureMatch(4), fixedRng([0.31, 0.62, 0.05, 0.77, 0.44, 0.9, 0.13, 0.22, 0.55, 0.66, 0.08, 0.99, 0.17, 0.38]));
    const view = getViewFor(state, state.players[0]!.id);
    const serialized = JSON.stringify(view);
    for (const stockCard of state.hand!.stock) {
      expect(serialized).not.toContain(JSON.stringify(stockCard));
    }
  });

  it("shows every other player's card COUNT only, never their hand contents", () => {
    const state = deal(fixtureMatch(2), fixedRng([0.31, 0.62, 0.05, 0.77, 0.44, 0.9, 0.13, 0.22, 0.55, 0.66, 0.08, 0.99]));
    const view = getViewFor(state, state.players[0]!.id);
    expect(view.others).toHaveLength(1);
    expect(view.others[0]!.cardsRemaining).toBe(3);
    expect(view.others[0]).not.toHaveProperty("hand");
  });

  it("keeps the table, piles, escobas and dealer seat public", () => {
    const state = deal(fixtureMatch(2), fixedRng([0.31, 0.62, 0.05, 0.77, 0.44, 0.9, 0.13, 0.22, 0.55, 0.66, 0.08, 0.99]));
    const view = getViewFor(state, state.players[0]!.id);
    expect(view.hand?.table).toEqual(state.hand!.table);
    expect(view.hand?.piles).toEqual(state.hand!.piles);
    expect(view.hand?.escobas).toEqual(state.hand!.escobas);
    expect(view.dealerSeat).toBe(state.dealerSeat);
  });

  it("throws for an unknown player id", () => {
    const state = deal(fixtureMatch(2), fixedRng([0.31, 0.62, 0.05, 0.77, 0.44, 0.9, 0.13, 0.22, 0.55, 0.66, 0.08, 0.99]));
    expect(() => getViewFor(state, "nobody" as PlayerId)).toThrow();
  });
});
