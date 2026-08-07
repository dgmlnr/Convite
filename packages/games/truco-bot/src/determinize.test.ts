import { describe, expect, it } from "vitest";
import type { Card, PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import type { RandomSource } from "@hexdev/platform-contract";
import { sampleOpponentHand } from "./determinize.js";

const SELF = "player-a" as PlayerId;
const OPPONENT = "player-b" as PlayerId;
const SELF_TEAM = "player-a:team" as TeamId;
const OPPONENT_TEAM = "player-b:team" as TeamId;

/** Deterministic seeded generator (mulberry32) — NOT `Math.random`, exactly
 * the discipline this project applies to `truco-engine` itself, extended
 * here so the sampler's determinism can be proven reproducibly. */
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

function baseView(overrides: { selfHand: readonly Card[]; cardsRemaining: number }): PlayerView {
  return {
    self: { playerId: SELF, teamId: SELF_TEAM, seat: 0, hand: overrides.selfHand },
    teammates: [],
    opponents: [{ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: overrides.cardsRemaining }],
    teams: [{ id: SELF_TEAM, score: 0 }, { id: OPPONENT_TEAM, score: 0 }],
    hand: {
      manoSeat: 0,
      truco: { status: "none" },
      envido: { status: "none" },
      turnSeat: 0,
      currentTrickPlays: [],
      trickOutcomes: [],
      outcome: { decided: false },
    },
    config: { pointsToWin: 15 },
    dealerSeat: 1,
  };
}

describe("sampleOpponentHand", () => {
  it("samples exactly the opponent's cardsRemaining count", () => {
    const view = baseView({ selfHand: [{ suit: "espada", rank: 1 }], cardsRemaining: 3 });
    const sample = sampleOpponentHand(view, seededRng(1));
    expect(sample.length).toBe(3);
  });

  it("never includes a card that is in the bot's own hand — a deterministic rng that always picks the FIRST pool card proves the exclusion is real, not luck", () => {
    // buildDeck()'s first three cards, in order, are espada 1/2/3 (SUITS/RANKS
    // order). A zero-returning rng always samples pool[0]; without the
    // exclusion filter it would deterministically re-draw exactly these.
    const selfHand: readonly Card[] = [{ suit: "espada", rank: 1 }, { suit: "espada", rank: 2 }, { suit: "espada", rank: 3 }];
    const view = baseView({ selfHand, cardsRemaining: 3 });
    const alwaysFirst: RandomSource = () => 0;
    const sample = sampleOpponentHand(view, alwaysFirst);
    for (const card of selfHand) {
      expect(sample.some((c) => c.suit === card.suit && c.rank === card.rank)).toBe(false);
    }
  });

  it("is reproducible: two fresh generators seeded the same way produce the same sample", () => {
    const view = baseView({ selfHand: [{ suit: "espada", rank: 1 }], cardsRemaining: 3 });
    const first = sampleOpponentHand(view, seededRng(7));
    const second = sampleOpponentHand(view, seededRng(7));
    expect(second).toEqual(first);
  });

  it("different seeds are very likely to sample a different hand (triangulation: the rng is actually consulted)", () => {
    const view = baseView({ selfHand: [{ suit: "espada", rank: 1 }], cardsRemaining: 3 });
    const a = sampleOpponentHand(view, seededRng(7));
    const b = sampleOpponentHand(view, seededRng(999));
    expect(a).not.toEqual(b);
  });
});
