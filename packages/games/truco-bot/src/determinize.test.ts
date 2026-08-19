import { describe, expect, it } from "vitest";
import type { Card, HandPlay, PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
import type { RandomSource } from "@hexdev/platform-contract";
import { sampleAllOpponentHands, sampleHiddenHands, sampleOpponentHand } from "./determinize.js";

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

const OPPONENT_2 = "player-d" as PlayerId;
const OPPONENT_2_TEAM = "player-b:team" as TeamId; // same team as OPPONENT — teammates across the table
const PARTNER = "player-c" as PlayerId;

/** A 2v2 view fixture — TWO real opponents plus a teammate, unlike
 * `baseView`'s single opponent. Module-scoped because BOTH multi-hand
 * samplers below (`sampleAllOpponentHands` and `sampleHiddenHands`) are
 * exercised against the same table shape. */
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

/** `sampleOpponentHand` above only ever reads `view.opponents[0]`, exactly
 * the "assumes exactly one opponent" gap the apply prompt names — this
 * block covers the 2v2-safe replacement instead of widening that function's
 * own contract (which every existing 1v1 caller/test relies on staying
 * single-opponent-shaped). */
describe("sampleAllOpponentHands — one sampled hand PER real opponent (1v1: same as sampleOpponentHand; 2v2: both opponents, drawn from a shared pool so no card is double-counted)", () => {

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

/** The slice-2 sampler: ONE shared-pool draw per determinization round that
 * deals the PARTNER's hidden hand alongside every opponent's, all disjoint —
 * closing the disclosed "an opponent can be dealt a card the partner actually
 * holds" simplification `sampleAllOpponentHands` carries. */
describe("sampleHiddenHands — partner AND opponents dealt disjointly from one shared unseen pool", () => {
  it("2v2: sizes every hand from its own view field — partner by teammates[0].cardsRemaining, each opponent by its own cardsRemaining, and a 0-card partner samples to [] (present but empty), not null", () => {
    const view = twoOpponentView({ selfHand: [{ suit: "espada", rank: 1 }], cardsRemaining: [3, 2], partnerCardsRemaining: 2 });
    const { partner, opponents } = sampleHiddenHands(view, seededRng(1));
    expect(partner).toHaveLength(2);
    expect(opponents).toHaveLength(2);
    expect(opponents[0]).toHaveLength(3);
    expect(opponents[1]).toHaveLength(2);

    const spent = twoOpponentView({ selfHand: [{ suit: "espada", rank: 1 }], cardsRemaining: [3, 2], partnerCardsRemaining: 0 });
    expect(sampleHiddenHands(spent, seededRng(1)).partner).toEqual([]);
  });

  it("2v2: partner and opponent hands are mutually DISJOINT and never contain a seen card — the exact double-counting sampleAllOpponentHands discloses", () => {
    // A full resolved trick plus the bot's own remaining card = 5 seen cards.
    // Across several seeds (deterministic, not probabilistic: each seed is a
    // fixed draw), the 9 sampled cards must be 9 DIFFERENT cards, none seen.
    const seen = [ESPADA_1, ESPADA_2, ESPADA_3, ESPADA_4, { suit: "copa", rank: 12 } as Card];
    const view = twoOpponentView({
      selfHand: [{ suit: "copa", rank: 12 }],
      cardsRemaining: [3, 3],
      partnerCardsRemaining: 3,
      resolvedTrickPlays: [[
        play(SELF, SELF_TEAM, 0, ESPADA_1),
        play(OPPONENT, OPPONENT_TEAM, 1, ESPADA_2),
        play(PARTNER, SELF_TEAM, 2, ESPADA_3),
        play(OPPONENT_2, OPPONENT_2_TEAM, 3, ESPADA_4),
      ]],
    });
    for (const seed of [1, 42, 999]) {
      const { partner, opponents } = sampleHiddenHands(view, seededRng(seed));
      const sampled = [...partner!, ...opponents.flat()];
      const ids = sampled.map((c) => `${c.rank}-${c.suit}`);
      expect(new Set(ids).size).toBe(9);
      for (const card of seen) {
        expect(sampled.some((c) => c.suit === card.suit && c.rank === card.rank)).toBe(false);
      }
    }
  });

  it("2v2: opponents draw FIRST (in view order), the partner LAST — pinned with alwaysFirst", () => {
    // The draw ORDER is a contract, not an accident: with no partner draws in
    // front of them, the opponent draws consume the exact same rng stream as
    // `sampleAllOpponentHands` — which is what keeps 1v1 byte-identical (the
    // next test) and 2v2 opponent samples aligned with the old sampler's.
    // Dealing the partner last is distributionally free: dealing disjoint
    // hands from a uniform pool is exchangeable, so WHEN the partner's cards
    // leave the pool never changes what they could be.
    const view = twoOpponentView({ selfHand: [], cardsRemaining: [1, 1], partnerCardsRemaining: 2 });
    const { partner, opponents } = sampleHiddenHands(view, alwaysFirst);
    expect(opponents).toEqual([[ESPADA_1], [ESPADA_2]]);
    expect(partner).toEqual([ESPADA_3, ESPADA_4]);
  });

  it("1v1: partner is null and the opponent draws are IDENTICAL to sampleAllOpponentHands under the same seed — the rng-stream identity every 1v1 hard-tier decision relies on", () => {
    const view = baseView({ selfHand: [{ suit: "espada", rank: 1 }], cardsRemaining: 3 });
    const { partner, opponents } = sampleHiddenHands(view, seededRng(7));
    expect(partner).toBeNull();
    expect(opponents).toEqual(sampleAllOpponentHands(view, seededRng(7)));
  });

  it("is reproducible: the same seed replays the same draw; different seeds diverge (the rng is actually consulted for the partner too)", () => {
    const view = twoOpponentView({ selfHand: [{ suit: "espada", rank: 1 }], cardsRemaining: [3, 3] });
    expect(sampleHiddenHands(view, seededRng(7))).toEqual(sampleHiddenHands(view, seededRng(7)));
    const a = sampleHiddenHands(view, seededRng(7));
    const b = sampleHiddenHands(view, seededRng(999));
    expect(a.partner).not.toEqual(b.partner);
  });
});
