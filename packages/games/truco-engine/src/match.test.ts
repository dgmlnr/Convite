import { describe, expect, it } from "vitest";
import type { Card } from "./card.js";
import type { PlayerId } from "./ids.js";
import { createHeadToHeadMatch, rotateDealer, startHand } from "./match.js";

const playerA = "player-a" as PlayerId;
const playerB = "player-b" as PlayerId;

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

  it("throws when the deal does not supply a hand for every seat", () => {
    const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });

    expect(() => startHand(state, [handOf(1)])).toThrow();
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
