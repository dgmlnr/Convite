import { describe, expect, it } from "vitest";
import type { Card } from "./card.js";
import type { PlayerId } from "./ids.js";
import { createHeadToHeadMatch, createTeamMatch, getMatchWinner, rotateDealer, startHand } from "./match.js";

const playerA = "player-a" as PlayerId;
const playerB = "player-b" as PlayerId;
const playerC = "player-c" as PlayerId;
const playerD = "player-d" as PlayerId;

const handOf = (rank: Card["rank"]): readonly Card[] => [{ suit: "espada", rank }];

describe("createHeadToHeadMatch", () => {
  it("creates exactly two teams of one player each, each owning its own score field", () => {
    const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });

    expect(state.teams).toHaveLength(2);
    for (const team of state.teams) {
      expect(team.playerIds).toHaveLength(1);
      expect(team.score).toBe(0);
    }
    expect(state.teams[0]!.id).not.toBe(state.teams[1]!.id);
  });
});

/**
 * 2v2 (design: "partners seated across from each other so seats alternate
 * teams"). Seat order around the table is 0,1,2,3; partners sit ACROSS from
 * each other, i.e. seat 0 with seat 2 and seat 1 with seat 3 — which is
 * exactly the alternating pattern (team A, team B, team A, team B).
 */
describe("createTeamMatch (2v2)", () => {
  it("seats four players with partners across the table, alternating teams by seat", () => {
    const state = createTeamMatch({
      seatOrder: [playerA, playerB, playerC, playerD],
      pointsToWin: 15,
    });

    expect(state.players).toHaveLength(4);
    expect(state.teams).toHaveLength(2);

    const seatOf = (id: PlayerId) => state.players.find((p) => p.id === id)!;
    // seat 0 (A) and seat 2 (C) are partners; seat 1 (B) and seat 3 (D) are partners.
    expect(seatOf(playerA).teamId).toBe(seatOf(playerC).teamId);
    expect(seatOf(playerB).teamId).toBe(seatOf(playerD).teamId);
    // The two teams are genuinely different — not everyone on one team.
    expect(seatOf(playerA).teamId).not.toBe(seatOf(playerB).teamId);
  });

  it("gives each team exactly two playerIds, both starting at score 0", () => {
    const state = createTeamMatch({
      seatOrder: [playerA, playerB, playerC, playerD],
      pointsToWin: 30,
    });

    for (const team of state.teams) {
      expect(team.playerIds).toHaveLength(2);
      expect(team.score).toBe(0);
    }
  });

  it("assigns seats 0..3 in the supplied order", () => {
    const state = createTeamMatch({
      seatOrder: [playerA, playerB, playerC, playerD],
      pointsToWin: 15,
    });

    expect(state.players.map((p) => p.id)).toEqual([playerA, playerB, playerC, playerD]);
    expect(state.players.map((p) => p.seat)).toEqual([0, 1, 2, 3]);
  });
});

describe("startHand", () => {
  it("deals the already-materialized cards to each player without mutating the input state", () => {
    const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
    const deal = [handOf(1), handOf(2)];

    const next = startHand(state, deal);

    expect(next.players[0]!.hand).toEqual(deal[0]);
    expect(next.players[1]!.hand).toEqual(deal[1]);
    expect(state.players[0]!.hand).toEqual([]);
    expect(state.hand).toBeNull();
  });

  it("determines mano as the player immediately to the dealer's right", () => {
    const state = createHeadToHeadMatch({
      playerAId: playerA,
      playerBId: playerB,
      pointsToWin: 15,
      dealerSeat: 0,
    });

    const next = startHand(state, [handOf(1), handOf(2)]);

    expect(next.hand?.manoSeat).toBe(1);
  });

  it("starts a fresh hand with no truco call pending, even after a prior hand's decline", () => {
    const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });

    const next = startHand(state, [handOf(1), handOf(2)]);

    expect(next.hand?.truco).toEqual({ status: "none" });
  });

  it("starts a fresh hand with no envido call pending", () => {
    const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });

    const next = startHand(state, [handOf(1), handOf(2)]);

    expect(next.hand?.envido).toEqual({ status: "none" });
  });

  it("throws when the deal does not supply a hand for every seat", () => {
    const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });

    expect(() => startHand(state, [handOf(1)])).toThrow();
  });
});

describe("getMatchWinner (spec: 'Match and Hand Termination')", () => {
  it("returns null while every team's score is below the target", () => {
    const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
    expect(getMatchWinner(state)).toBeNull();
  });

  it("returns the team id once its score reaches the target", () => {
    const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
    const winning = { ...state, teams: [{ ...state.teams[0]!, score: 15 }, state.teams[1]!] };

    expect(getMatchWinner(winning)).toBe(state.teams[0]!.id);
  });
});

describe("rotateDealer", () => {
  it("rotates mano to the next player when a new hand starts", () => {
    const firstHandState = createHeadToHeadMatch({
      playerAId: playerA,
      playerBId: playerB,
      pointsToWin: 15,
      dealerSeat: 0,
    });
    const firstHand = startHand(firstHandState, [handOf(1), handOf(2)]);
    expect(firstHand.hand?.manoSeat).toBe(1); // mano was player B

    const secondHandState = rotateDealer(firstHand);
    const secondHand = startHand(secondHandState, [handOf(3), handOf(4)]);

    expect(secondHand.hand?.manoSeat).toBe(0); // mano rotates to player A
  });
});
