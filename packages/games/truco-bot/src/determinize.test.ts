import { describe, expect, it } from "vitest";
import type { Card, HandPlay, PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
import type { RandomSource } from "@hexdev/platform-contract";
import { sampleAllOpponentHands, sampleOpponentHand } from "./determinize.js";

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

function baseView(overrides: {
  selfHand: readonly Card[];
  cardsRemaining: number;
  resolvedTrickPlays?: readonly (readonly HandPlay[])[];
}): PlayerView {
  return {
    self: { playerId: SELF, teamId: SELF_TEAM, seat: 0, hand: overrides.selfHand, lastSena: null, senasRemaining: MAX_SENAS_PER_HAND },
    teammates: [],
    opponents: [{ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: overrides.cardsRemaining }],
    teams: [{ id: SELF_TEAM, score: 0 }, { id: OPPONENT_TEAM, score: 0 }],
    hand: {
      manoSeat: 0,
      truco: { status: "none" },
      envido: { status: "none" },
      turnSeat: 0,
      currentTrickPlays: [],
      resolvedTrickPlays: overrides.resolvedTrickPlays ?? [],
      callEvents: [],
      trickOutcomes: [],
      outcome: { decided: false },
    },
    config: { pointsToWin: 15 },
    dealerSeat: 1,
  };
}

/** An rng that always returns 0 therefore always samples `pool[0]`: whatever
 * the head of the pool is, it lands in the sample. That makes "card X was
 * still in the pool" an assertion about a FIXED sample rather than a
 * probabilistic one — the same trick the self-hand exclusion test below
 * already relies on. */
const alwaysFirst: RandomSource = () => 0;

function play(playerId: PlayerId, teamId: TeamId, seat: number, card: Card): HandPlay {
  return { playerId, teamId, seat, card };
}

/** `buildDeck()` walks SUITS then RANKS, so its first cards are espada
 * 1/2/3/4/5/6 in that exact order. Naming them here keeps the expectations
 * below readable: with `alwaysFirst`, the sample is simply the first N cards
 * the pool still contains. */
const ESPADA_1: Card = { suit: "espada", rank: 1 };
const ESPADA_2: Card = { suit: "espada", rank: 2 };
const ESPADA_3: Card = { suit: "espada", rank: 3 };
const ESPADA_4: Card = { suit: "espada", rank: 4 };

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
    const selfHand: readonly Card[] = [ESPADA_1, ESPADA_2, ESPADA_3];
    const view = baseView({ selfHand, cardsRemaining: 3 });
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

  it("never includes a card the OPPONENT already played in a resolved trick — it is face up on the table, not in a hand", () => {
    // The opponent led espada 1 in trick 1 and it is now lying on the table.
    // No sampled hand may contain it: `alwaysFirst` would otherwise draw it
    // as pool[0], the very first card `buildDeck()` produces.
    const view = baseView({
      selfHand: [],
      cardsRemaining: 2,
      resolvedTrickPlays: [[play(OPPONENT, OPPONENT_TEAM, 1, ESPADA_1), play(SELF, SELF_TEAM, 0, ESPADA_2)]],
    });
    expect(sampleOpponentHand(view, alwaysFirst)).toEqual([ESPADA_3, ESPADA_4]);
  });

  it("never includes a card the BOT ITSELF already played in a resolved trick — `self.hand` only holds what is still UNPLAYED", () => {
    // The bot's own spent cards leave `self.hand`, so they are only knowable
    // through the trick log. Espada 2 below is one of them, and it is just as
    // impossible for the opponent to hold as the opponent's own espada 1.
    const view = baseView({
      selfHand: [ESPADA_3],
      cardsRemaining: 1,
      resolvedTrickPlays: [[play(OPPONENT, OPPONENT_TEAM, 1, ESPADA_1), play(SELF, SELF_TEAM, 0, ESPADA_2)]],
    });
    expect(sampleOpponentHand(view, alwaysFirst)).toEqual([ESPADA_4]);
  });

  it("excludes plays from EVERY resolved trick, not just the most recent one", () => {
    // `resolvedTrickPlays` is one entry PER trick, so a fix that reads only
    // the last entry (or forgets to flatten) still leaks trick 1's cards.
    const view = baseView({
      selfHand: [],
      cardsRemaining: 1,
      resolvedTrickPlays: [
        [play(OPPONENT, OPPONENT_TEAM, 1, ESPADA_1), play(SELF, SELF_TEAM, 0, ESPADA_2)],
        [play(SELF, SELF_TEAM, 0, ESPADA_3), play(OPPONENT, OPPONENT_TEAM, 1, ESPADA_4)],
      ],
    });
    expect(sampleOpponentHand(view, alwaysFirst)).toEqual([{ suit: "espada", rank: 5 }]);
  });
});

/** A 2v2 view fixture — TWO real opponents, unlike `baseView`'s single one.
 * `sampleOpponentHand` above only ever reads `view.opponents[0]`, exactly
 * the "assumes exactly one opponent" gap the apply prompt names — this
 * block covers the 2v2-safe replacement instead of widening that function's
 * own contract (which every existing 1v1 caller/test relies on staying
 * single-opponent-shaped). */
describe("sampleAllOpponentHands — one sampled hand PER real opponent (1v1: same as sampleOpponentHand; 2v2: both opponents, drawn from a shared pool so no card is double-counted)", () => {
  const OPPONENT_2 = "player-d" as PlayerId;
  const OPPONENT_2_TEAM = "player-b:team" as TeamId; // same team as OPPONENT — teammates across the table
  const PARTNER = "player-c" as PlayerId;

  function twoOpponentView(overrides: {
    selfHand: readonly Card[];
    cardsRemaining: [number, number];
    partnerCardsRemaining?: number;
    resolvedTrickPlays?: readonly (readonly HandPlay[])[];
  }): PlayerView {
    const base = baseView({
      selfHand: overrides.selfHand,
      cardsRemaining: overrides.cardsRemaining[0],
      resolvedTrickPlays: overrides.resolvedTrickPlays,
    });
    return {
      ...base,
      teammates: [{ playerId: PARTNER, seat: 2, cardsRemaining: overrides.partnerCardsRemaining ?? 3, lastSena: null }],
      opponents: [
        { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: overrides.cardsRemaining[0] },
        { playerId: OPPONENT_2, teamId: OPPONENT_2_TEAM, seat: 3, cardsRemaining: overrides.cardsRemaining[1] },
      ],
    };
  }

  it("1v1 (a single opponent): returns exactly one sampled hand, of the opponent's own cardsRemaining size", () => {
    const view = baseView({ selfHand: [{ suit: "espada", rank: 1 }], cardsRemaining: 3 });
    const hands = sampleAllOpponentHands(view, seededRng(1));
    expect(hands).toHaveLength(1);
    expect(hands[0]).toHaveLength(3);
  });

  it("2v2 (two opponents): returns TWO sampled hands, each sized to its own opponent's cardsRemaining", () => {
    const view = twoOpponentView({ selfHand: [{ suit: "espada", rank: 1 }], cardsRemaining: [3, 2] });
    const hands = sampleAllOpponentHands(view, seededRng(1));
    expect(hands).toHaveLength(2);
    expect(hands[0]).toHaveLength(3);
    expect(hands[1]).toHaveLength(2);
  });

  it("2v2: the same physical card is never sampled into BOTH opponents' hands in the same round", () => {
    const view = twoOpponentView({ selfHand: [], cardsRemaining: [3, 3] });
    const hands = sampleAllOpponentHands(view, seededRng(42));
    const ids = [...hands[0]!, ...hands[1]!].map((c) => `${c.rank}-${c.suit}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("2v2: a resolved trick's cards are gone from the pool no matter WHOSE they were — all four seats play face up", () => {
    // One complete 2v2 trick: the bot, both opponents AND the bot's own
    // partner each put a card on the table. Every one of those four is public
    // information the moment it lands, so none may come back as a sampled
    // opponent card. `alwaysFirst` pins the answer: the first two cards the
    // pool still holds after espada 1-4 are removed.
    const view = twoOpponentView({
      selfHand: [],
      cardsRemaining: [1, 1],
      resolvedTrickPlays: [[
        play(SELF, SELF_TEAM, 0, ESPADA_1),
        play(OPPONENT, OPPONENT_TEAM, 1, ESPADA_2),
        play(PARTNER, SELF_TEAM, 2, ESPADA_3),
        play(OPPONENT_2, OPPONENT_2_TEAM, 3, ESPADA_4),
      ]],
    });
    expect(sampleAllOpponentHands(view, alwaysFirst)).toEqual([[{ suit: "espada", rank: 5 }], [{ suit: "espada", rank: 6 }]]);
  });

  it("2v2: the partner's UNPLAYED cards stay in the pool — seeing a partner play a card is not seeing their hand", () => {
    // The exact boundary the test above must not overshoot. The partner still
    // holds two cards; those are hidden from the bot and remain legitimate
    // candidates. Asking for more cards than exist drains the pool, so the
    // sample length IS the pool size: 40 minus the bot's own 1 remaining card
    // minus the 4 played ones — and NOT minus the partner's 2 hidden ones.
    const view = twoOpponentView({
      selfHand: [{ suit: "copa", rank: 12 }],
      cardsRemaining: [99, 0],
      partnerCardsRemaining: 2,
      resolvedTrickPlays: [[
        play(SELF, SELF_TEAM, 0, ESPADA_1),
        play(OPPONENT, OPPONENT_TEAM, 1, ESPADA_2),
        play(PARTNER, SELF_TEAM, 2, ESPADA_3),
        play(OPPONENT_2, OPPONENT_2_TEAM, 3, ESPADA_4),
      ]],
    });
    expect(sampleAllOpponentHands(view, alwaysFirst)[0]).toHaveLength(35);
  });
});
