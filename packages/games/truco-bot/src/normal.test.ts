import { describe, expect, it } from "vitest";
import type { Action, Card, HandPlay, PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { createNormalBot } from "./normal.js";

const SELF = "player-a" as PlayerId;
const OPPONENT = "player-b" as PlayerId;
const SELF_TEAM = "player-a:team" as TeamId;
const OPPONENT_TEAM = "player-b:team" as TeamId;

function viewWith(overrides: { hand: readonly Card[]; currentTrickPlays?: readonly HandPlay[] }): PlayerView {
  return {
    self: { playerId: SELF, teamId: SELF_TEAM, seat: 0, hand: overrides.hand },
    teammates: [],
    opponents: [{ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 3 }],
    teams: [{ id: SELF_TEAM, score: 0 }, { id: OPPONENT_TEAM, score: 0 }],
    hand: {
      manoSeat: 0,
      truco: { status: "none" },
      envido: { status: "none" },
      turnSeat: 0,
      currentTrickPlays: overrides.currentTrickPlays ?? [],
      trickOutcomes: [],
      outcome: { decided: false },
    },
    config: { pointsToWin: 15 },
    dealerSeat: 1,
  };
}

describe("createNormalBot — weighted heuristics with light lookahead", () => {
  it("throws when given no legal actions", () => {
    expect(() => createNormalBot().chooseAction(viewWith({ hand: [] }), [], 50)).toThrow();
  });

  it("following a visible opponent card: plays the cheapest card that still wins", () => {
    const view = viewWith({
      hand: [{ suit: "basto", rank: 4 }],
      currentTrickPlays: [{ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: { suit: "basto", rank: 4 } }],
    });
    const cheapWin: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 3 } }; // power 11, beats basto-4 (power 1)
    const expensiveWin: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 1 } }; // power 14, also beats it but overkill
    expect(createNormalBot().chooseAction(view, [expensiveWin, cheapWin], 50)).toBe(cheapWin);
  });

  it("leading with no visible opponent card: plays the WEAKEST card, saving strength for later", () => {
    const view = viewWith({ hand: [] });
    const weak: Action = { type: "play-card", playerId: SELF, card: { suit: "basto", rank: 4 } };
    const strong: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 1 } };
    expect(createNormalBot().chooseAction(view, [strong, weak], 50)).toBe(weak);
  });

  it("declines a truco call with a clearly weak hand", () => {
    const weakHand: readonly Card[] = [{ suit: "basto", rank: 4 }, { suit: "copa", rank: 4 }, { suit: "oro", rank: 4 }];
    const view = viewWith({ hand: weakHand });
    const quiero: Action = { type: "respond-truco", playerId: SELF, response: "quiero" };
    const noQuiero: Action = { type: "respond-truco", playerId: SELF, response: "no-quiero" };
    expect(createNormalBot().chooseAction(view, [quiero, noQuiero], 50)).toBe(noQuiero);
  });

  it("accepts a truco call with a clearly strong hand (triangulation: opposite of the weak case)", () => {
    const strongHand: readonly Card[] = [{ suit: "espada", rank: 1 }, { suit: "basto", rank: 1 }, { suit: "espada", rank: 7 }];
    const view = viewWith({ hand: strongHand });
    const quiero: Action = { type: "respond-truco", playerId: SELF, response: "quiero" };
    const noQuiero: Action = { type: "respond-truco", playerId: SELF, response: "no-quiero" };
    expect(createNormalBot().chooseAction(view, [quiero, noQuiero], 50)).toBe(quiero);
  });

  it("volunteers a truco call only with a strong hand, preferring it over just playing a card", () => {
    const strongHand: readonly Card[] = [{ suit: "espada", rank: 1 }, { suit: "basto", rank: 1 }, { suit: "espada", rank: 7 }];
    const view = viewWith({ hand: strongHand });
    const callTruco: Action = { type: "call-truco", playerId: SELF, level: "truco" };
    const playCard: Action = { type: "play-card", playerId: SELF, card: strongHand[0]! };
    expect(createNormalBot().chooseAction(view, [callTruco, playCard], 50)).toBe(callTruco);
  });

  it("does NOT volunteer a truco call with a weak hand, playing a card instead", () => {
    const weakHand: readonly Card[] = [{ suit: "basto", rank: 4 }, { suit: "copa", rank: 4 }, { suit: "oro", rank: 4 }];
    const view = viewWith({ hand: weakHand });
    const callTruco: Action = { type: "call-truco", playerId: SELF, level: "truco" };
    const playCard: Action = { type: "play-card", playerId: SELF, card: weakHand[0]! };
    expect(createNormalBot().chooseAction(view, [callTruco, playCard], 50)).toBe(playCard);
  });
});
