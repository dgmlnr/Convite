import { describe, expect, it } from "vitest";
import type { Action, Card, HandPlay, PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import type { RandomSource } from "@hexdev/platform-contract";
import { createHardBot } from "./hard.js";

const SELF = "player-a" as PlayerId;
const OPPONENT = "player-b" as PlayerId;
const SELF_TEAM = "player-a:team" as TeamId;
const OPPONENT_TEAM = "player-b:team" as TeamId;

function seededRng(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function viewWith(overrides: { hand: readonly Card[]; cardsRemaining?: number; currentTrickPlays?: readonly HandPlay[] }): PlayerView {
  return {
    self: { playerId: SELF, teamId: SELF_TEAM, seat: 0, hand: overrides.hand },
    teammates: [],
    opponents: [{ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: overrides.cardsRemaining ?? 3 }],
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

// The 3 single strongest cards in the whole deck (all in distinct power
// groups per card-power.ts's POWER_ORDER) — no sampled 3-card opponent hand
// can ever beat this, for ANY rng, which makes the win/lose assertions below
// deterministic rather than probabilistic.
const UNBEATABLE_HAND: readonly Card[] = [
  { suit: "espada", rank: 1 },
  { suit: "basto", rank: 1 },
  { suit: "espada", rank: 7 },
];
// All power-1 cards (the weakest group) — any sampled 3-card opponent hand
// necessarily beats this.
const WORST_HAND: readonly Card[] = [
  { suit: "espada", rank: 4 },
  { suit: "basto", rank: 4 },
  { suit: "oro", rank: 4 },
];

describe("createHardBot — determinization + Monte Carlo evaluation", () => {
  it("throws when given no legal actions", () => {
    expect(() => createHardBot(seededRng(1)).chooseAction(viewWith({ hand: [] }), [], 50)).toThrow();
  });

  it("accepts a truco call when its hand cannot lose to ANY possible opponent hand", () => {
    const view = viewWith({ hand: UNBEATABLE_HAND });
    const quiero: Action = { type: "respond-truco", playerId: SELF, response: "quiero" };
    const noQuiero: Action = { type: "respond-truco", playerId: SELF, response: "no-quiero" };
    expect(createHardBot(seededRng(3)).chooseAction(view, [quiero, noQuiero], 50)).toBe(quiero);
  });

  it("declines a truco call when its hand cannot beat ANY possible opponent hand (triangulation)", () => {
    const view = viewWith({ hand: WORST_HAND });
    const quiero: Action = { type: "respond-truco", playerId: SELF, response: "quiero" };
    const noQuiero: Action = { type: "respond-truco", playerId: SELF, response: "no-quiero" };
    expect(createHardBot(seededRng(3)).chooseAction(view, [quiero, noQuiero], 50)).toBe(noQuiero);
  });

  it("leading a trick: prefers the card most likely to beat a sampled opponent's best card", () => {
    // espada-1 is the single strongest card in the deck (power 14) — no
    // sample drawn from the remaining pool can ever exceed it. basto-4 is
    // in the weakest group (power 1) — only 3 other power-1 cards exist in
    // the whole 40-card deck, so any 3-card sample overwhelmingly likely
    // contains at least one stronger card. This makes the outcome
    // deterministic for the fixed seeded rng used here.
    const view = viewWith({ hand: [{ suit: "espada", rank: 1 }, { suit: "basto", rank: 4 }] });
    const guaranteed: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 1 } };
    const risky: Action = { type: "play-card", playerId: SELF, card: { suit: "basto", rank: 4 } };
    expect(createHardBot(seededRng(11)).chooseAction(view, [risky, guaranteed], 50)).toBe(guaranteed);
  });

  it("following a visible opponent card: delegates to the exact same public-info scoring as the normal tier", () => {
    const opponentCard: Card = { suit: "basto", rank: 4 };
    const view = viewWith({
      hand: [],
      currentTrickPlays: [{ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: opponentCard }],
    });
    const cheapWin: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 3 } };
    const expensiveWin: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 1 } };
    expect(createHardBot(seededRng(5)).chooseAction(view, [expensiveWin, cheapWin], 50)).toBe(cheapWin);
  });
});
