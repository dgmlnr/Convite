import { describe, expect, it } from "vitest";
import type { Card, HandPlay, PlayerId, PlayerView, SenaView, TeamId } from "@hexdev/truco-engine";
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
  partnerLastSena?: SenaView | null;
  resolvedTrickPlays?: readonly (readonly HandPlay[])[];
}): PlayerView {
  const base = baseView({
    selfHand: overrides.selfHand,
    cardsRemaining: overrides.cardsRemaining[0],
    resolvedTrickPlays: overrides.resolvedTrickPlays,
  });
  return {
    ...base,
    teammates: [{ playerId: PARTNER, seat: 2, cardsRemaining: overrides.partnerCardsRemaining ?? 3, lastSena: overrides.partnerLastSena ?? null }],
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

/** Same helpers as sena-emission.test.ts's house pattern: a scripted prefix
 * pins the exact draws a branch decision needs, and anything after falls
 * through to the tail — which is `forbiddenRng` wherever a test's whole point
 * is "this path consumes EXACTLY these draws and not one more". */
function scriptedRng(values: readonly number[], tail: RandomSource = seededRng(1)): RandomSource {
  let index = 0;
  return () => (index < values.length ? values[index++]! : tail());
}

const forbiddenRng: RandomSource = () => {
  throw new Error("this path must not consume the rng");
};

const ESPADA_5: Card = { suit: "espada", rank: 5 };
const ESPADA_7: Card = { suit: "espada", rank: 7 };

/** The slice-4 bias: `teammates[0].lastSena` — a claim the partner chose to
 * flash, legitimately visible to this seat (señas are team-internal; the
 * engine's redaction fence keeps them from opponents) — tilts the PARTNER's
 * sampled hand toward the claimed card(s). A claim, never a certainty: the
 * hard tier bluffs, so the bias is a weighted coin (SENA_TRUST), not a rule. */
describe("sampleHiddenHands — the partner's lastSena biases the partner draw (slice 4)", () => {
  const MATA_CLAIM: SenaView = { signal: "asDeEspada", seq: 1 };

  it("exact-card claim, trust draw crosses: the partner sample CONTAINS the claimed card, forced first, then deals the rest as usual", () => {
    // Zero-card opponents consume no draws, so the scripted values map 1:1
    // onto the partner deal: 0.1 crosses SENA_TRUST (the claim is believed),
    // espada-1 is forced with NO further selection draw (an exact signal
    // names one card — there is nothing to select), and the remaining card
    // is dealt exactly as today with draw 0 → the pool head, espada-2.
    const view = twoOpponentView({ selfHand: [], cardsRemaining: [0, 0], partnerCardsRemaining: 2, partnerLastSena: MATA_CLAIM });
    const { partner, opponents } = sampleHiddenHands(view, scriptedRng([0.1, 0], forbiddenRng));
    expect(partner).toEqual([ESPADA_1, ESPADA_2]);
    expect(opponents).toEqual([[], []]);
  });

  it("exact-card claim with opponents holding cards: the forced card joins AFTER the opponent draws, and full pool disjointness holds", () => {
    // Draw order is still the slice-2 contract: opponents first (0 → espada-1,
    // 0 → espada-2), partner last. The trust draw sits at the HEAD of the
    // partner deal — after every opponent draw — so opponent samples consume
    // the exact stream positions they always did. 0.1 crosses, espada-7 (the
    // claimed siete de espada) is forced, and the last card deals with 0 →
    // espada-3, the head of what remains. No card appears twice anywhere.
    const view = twoOpponentView({
      selfHand: [],
      cardsRemaining: [1, 1],
      partnerCardsRemaining: 2,
      partnerLastSena: { signal: "sieteDeEspada", seq: 1 },
    });
    const { partner, opponents } = sampleHiddenHands(view, scriptedRng([0, 0, 0.1, 0], forbiddenRng));
    expect(opponents).toEqual([[ESPADA_1], [ESPADA_2]]);
    expect(partner).toEqual([ESPADA_7, ESPADA_3]);
    const ids = [...partner!, ...opponents.flat()].map((c) => `${c.rank}-${c.suit}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("trust draw does NOT cross: the partner deal is UNBIASED — byte-identical to the no-seña draw under the same remaining stream", () => {
    // The bluff branch. The seña run spends exactly ONE draw on trust (the
    // scripted 0.99, above any sane SENA_TRUST) and then deals from the
    // seeded tail; the control run has no seña and deals from the same
    // seeded stream directly. Equal partner hands prove the bluff branch IS
    // today's sampler, shifted by exactly the one trust draw and nothing else.
    const claimed = twoOpponentView({ selfHand: [], cardsRemaining: [0, 0], partnerCardsRemaining: 2, partnerLastSena: MATA_CLAIM });
    const control = twoOpponentView({ selfHand: [], cardsRemaining: [0, 0], partnerCardsRemaining: 2 });
    const biased = sampleHiddenHands(claimed, scriptedRng([0.99], seededRng(7)));
    const unbiased = sampleHiddenHands(control, seededRng(7));
    expect(biased.partner).toEqual(unbiased.partner);
    expect(biased.opponents).toEqual([[], []]);
  });

  it("rank-level claim (tres): one uniformly-indexed rank-3 card from the pool's survivors is forced", () => {
    // A rank signal claims a RANK, not a card, so believing it costs one
    // extra selection draw: candidates are the pool's four 3s in deck order
    // (espada, basto, oro, copa), and 0.99 indexes the last — copa-3.
    const view = twoOpponentView({ selfHand: [], cardsRemaining: [0, 0], partnerCardsRemaining: 1, partnerLastSena: { signal: "tres", seq: 1 } });
    const { partner } = sampleHiddenHands(view, scriptedRng([0.1, 0.99], forbiddenRng));
    expect(partner).toEqual([{ suit: "copa", rank: 3 }]);
  });

  it("rank-level claim: only SURVIVORS are candidates — a tres in the bot's own hand is not one the partner could hold", () => {
    // The bot holds espada-3, so the claim's survivors are basto/oro/copa-3;
    // selection draw 0 picks the first of THOSE (basto-3), never espada-3.
    const view = twoOpponentView({
      selfHand: [ESPADA_3],
      cardsRemaining: [0, 0],
      partnerCardsRemaining: 1,
      partnerLastSena: { signal: "tres", seq: 1 },
    });
    const { partner } = sampleHiddenHands(view, scriptedRng([0.1, 0], forbiddenRng));
    expect(partner).toEqual([{ suit: "basto", rank: 3 }]);
  });

  it("dead claim (the claimed card is in the bot's OWN hand): unbiased sampling, and NO trust draw is consumed — proven by draw count", () => {
    // The claim is provably false — the bot is holding the very card. The
    // scripted prefix is EXACTLY the legitimate draw budget (two opponent
    // draws + two unbiased partner draws); the forbidden tail turns any
    // extra trust draw into a loud throw. Pool head after espada-1 leaves
    // with the bot's hand: espada-2 onward.
    const view = twoOpponentView({
      selfHand: [ESPADA_1],
      cardsRemaining: [1, 1],
      partnerCardsRemaining: 2,
      partnerLastSena: MATA_CLAIM,
    });
    const { partner, opponents } = sampleHiddenHands(view, scriptedRng([0, 0, 0, 0], forbiddenRng));
    expect(opponents).toEqual([[ESPADA_2], [ESPADA_3]]);
    expect(partner).toEqual([ESPADA_4, ESPADA_5]);
  });

  it("dead claim (the claimed card was already PLAYED): byte-identical to the no-seña sample under the same seed — the claim is spent, not information", () => {
    const played = [[play(OPPONENT, OPPONENT_TEAM, 1, ESPADA_1), play(SELF, SELF_TEAM, 0, ESPADA_2)]] as const;
    const claimed = twoOpponentView({
      selfHand: [],
      cardsRemaining: [2, 2],
      partnerCardsRemaining: 3,
      partnerLastSena: MATA_CLAIM,
      resolvedTrickPlays: played,
    });
    const control = twoOpponentView({ selfHand: [], cardsRemaining: [2, 2], partnerCardsRemaining: 3, resolvedTrickPlays: played });
    expect(sampleHiddenHands(claimed, seededRng(7))).toEqual(sampleHiddenHands(control, seededRng(7)));
  });

  it("a spent partner (0 cards) with a standing claim: samples to [] and consumes NO partner draws at all", () => {
    // Nothing can be forced into a hand that no longer exists; the claim is
    // dead by size. The scripted prefix covers exactly the two opponent
    // draws — the forbidden tail proves the partner branch draws nothing.
    const view = twoOpponentView({ selfHand: [], cardsRemaining: [1, 1], partnerCardsRemaining: 0, partnerLastSena: MATA_CLAIM });
    const { partner, opponents } = sampleHiddenHands(view, scriptedRng([0, 0], forbiddenRng));
    expect(partner).toEqual([]);
    expect(opponents).toEqual([[ESPADA_1], [ESPADA_2]]);
  });

  it("rank-level claim reduced to ONE survivor: the sole candidate is forced with NO selection draw — same shortcut as an exact signal (native review WARNING, review-69c6bbb80520fae0)", () => {
    // The bot holds three of the four 3s, so the claim's only survivor is
    // copa-3 and there is nothing to select among: the single-candidate
    // shortcut must skip the selection draw exactly as an exact-card signal
    // does. Scripted prefix = the one trust draw only; the forbidden tail
    // turns any selection draw into a loud throw — the draw-count pin every
    // other branch of this sampler already carries.
    const view = twoOpponentView({
      selfHand: [ESPADA_3, { suit: "basto", rank: 3 }, { suit: "oro", rank: 3 }],
      cardsRemaining: [0, 0],
      partnerCardsRemaining: 1,
      partnerLastSena: { signal: "tres", seq: 1 },
    });
    const { partner } = sampleHiddenHands(view, scriptedRng([0.1], forbiddenRng));
    expect(partner).toEqual([{ suit: "copa", rank: 3 }]);
  });

  it("no seña: byte-identical to today's sampler under the same seed — the pre-slice bytes, hardcoded as a regression pin", () => {
    // This exact HiddenHands was generated from the PRE-slice build (main,
    // 804eb2f) for this exact view and seed. A lastSena of null must keep
    // producing it byte for byte: zero extra draws, zero reordering. Green
    // from birth, deliberately — it pins absence of change, not new behavior.
    const view = twoOpponentView({ selfHand: [ESPADA_1], cardsRemaining: [3, 2], partnerCardsRemaining: 3 });
    expect(sampleHiddenHands(view, seededRng(7))).toEqual({
      partner: [{ suit: "basto", rank: 7 }, { suit: "basto", rank: 12 }, { suit: "basto", rank: 1 }],
      opponents: [
        [{ suit: "espada", rank: 2 }, { suit: "espada", rank: 5 }, { suit: "copa", rank: 12 }],
        [{ suit: "oro", rank: 11 }, { suit: "oro", rank: 2 }],
      ],
    });
  });

  it("1v1: no teammate means no seña to read — the opponent deal consumes EXACTLY its own draws and the trust draw cannot exist", () => {
    // In 1v1 there is no teammate, hence no lastSena to read: the scripted
    // prefix is exactly the opponent's three draws, and the forbidden tail
    // proves nothing else in the sampler touches the rng.
    const view = baseView({ selfHand: [], cardsRemaining: 3 });
    const { partner, opponents } = sampleHiddenHands(view, scriptedRng([0, 0, 0], forbiddenRng));
    expect(partner).toBeNull();
    expect(opponents).toEqual([[ESPADA_1, ESPADA_2, ESPADA_3]]);
  });
});
