import { describe, expect, it } from "vitest";
import type { Action, Card, HandPlay, PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
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
    self: { playerId: SELF, teamId: SELF_TEAM, seat: 0, hand: overrides.hand, lastSena: null, senasRemaining: MAX_SENAS_PER_HAND },
    teammates: [],
    opponents: [{ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: overrides.cardsRemaining ?? 3 }],
    teams: [{ id: SELF_TEAM, score: 0 }, { id: OPPONENT_TEAM, score: 0 }],
    hand: {
      manoSeat: 0,
      truco: { status: "none" },
      envido: { status: "none" },
      turnSeat: 0,
      currentTrickPlays: overrides.currentTrickPlays ?? [],
      resolvedTrickPlays: [],
      callEvents: [],
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

  // The tie-break itself, isolated. `leadingCardPlayChoice` scores a card by
  // COUNTING the sampled rounds it beats, and that count discards card power
  // entirely — so two cards of different power routinely land on the same
  // count (~18% of leading decisions). The count is monotone in power, so a
  // tied pair provably wins the very same rounds: the stronger card buys
  // nothing this trick and costs a card that is still worth more next trick.
  // Hence the weaker one, matching the normal tier's stated leading habit
  // ("conserve strength ... save strong cards for later tricks") and
  // `scoreFollowingCardPlay`'s "cheapest card that still wins".
  //
  // Both argument orders are asserted deliberately: the old tie-break kept
  // whichever tied card came first in `legalActions` (engine order = deal
  // order), so a single-order test passes half the time by luck and pins
  // nothing. Only the pair proves the choice is power-driven, not order-driven.
  describe("leading a trick — tie-break when two cards score identically", () => {
    // 1-espada (power 14) and 1-basto (power 13) are the top two cards in the
    // deck. Holding both, the strongest card any sample can contain is
    // 7-espada (power 12), so BOTH candidates beat every sampled round: a
    // guaranteed 24-24 tie for ANY rng, not a seed that happens to tie.
    const strongest: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 1 } };
    const secondStrongest: Action = { type: "play-card", playerId: SELF, card: { suit: "basto", rank: 1 } };
    const bothAlwaysWin: readonly Card[] = [{ suit: "espada", rank: 1 }, { suit: "basto", rank: 1 }];

    it("conserves the stronger card when the stronger is offered first", () => {
      const view = viewWith({ hand: bothAlwaysWin });
      expect(createHardBot(seededRng(7)).chooseAction(view, [strongest, secondStrongest], 50)).toBe(secondStrongest);
    });

    it("conserves the stronger card when the weaker is offered first (same choice, opposite order)", () => {
      const view = viewWith({ hand: bothAlwaysWin });
      expect(createHardBot(seededRng(7)).chooseAction(view, [secondStrongest, strongest], 50)).toBe(secondStrongest);
    });

    it("stays deterministic when the tied cards have EQUAL power: keeps the first, so a seed always replays the same line", () => {
      // Both 3s sit in the same power group (power 10), so no power-based
      // preference exists to apply and the choice must simply not wobble.
      const first: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 3 } };
      const second: Action = { type: "play-card", playerId: SELF, card: { suit: "basto", rank: 3 } };
      const view = viewWith({ hand: [{ suit: "espada", rank: 3 }, { suit: "basto", rank: 3 }] });
      expect(createHardBot(seededRng(7)).chooseAction(view, [first, second], 50)).toBe(first);
    });
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

describe("createHardBot — 2v2: considers BOTH opponents, not just opponents[0] (the fixed determinization gap)", () => {
  function viewWithTwoOpponents(overrides: { hand: readonly Card[] }): PlayerView {
    const OPPONENT_2 = "player-d" as PlayerId;
    return {
      self: { playerId: SELF, teamId: SELF_TEAM, seat: 0, hand: overrides.hand, lastSena: null, senasRemaining: MAX_SENAS_PER_HAND },
      teammates: [],
      // opponents[0] is GUARANTEED empty (0 cards remaining, samples to [])
      // — the OLD code (`sampleOpponentHand` reads only opponents[0]) would
      // see an empty hand every round and confidently accept ANY truco call,
      // since `handPower([]) === 0` always loses to a non-empty hand. The
      // REAL second opponent, holding 3 real cards, is what must actually
      // be beaten — ignoring it is exactly the disclosed "assumes exactly
      // one opponent" bug.
      opponents: [
        { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 0 },
        { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, cardsRemaining: 3 },
      ],
      teams: [{ id: SELF_TEAM, score: 0 }, { id: OPPONENT_TEAM, score: 0 }],
      hand: {
        manoSeat: 0,
        truco: { status: "pending", level: "truco", callingTeamId: OPPONENT_TEAM },
        envido: { status: "none" },
        turnSeat: 0,
        currentTrickPlays: [],
        resolvedTrickPlays: [],
        callEvents: [],
        trickOutcomes: [],
        outcome: { decided: false },
      },
      config: { pointsToWin: 15 },
      dealerSeat: 1,
    };
  }

  it("declines a truco call with a weak hand even though the FIRST opponent is guaranteed to have zero cards — the second, real opponent is what must be beaten", () => {
    const view = viewWithTwoOpponents({ hand: WORST_HAND });
    const quiero: Action = { type: "respond-truco", playerId: SELF, response: "quiero" };
    const noQuiero: Action = { type: "respond-truco", playerId: SELF, response: "no-quiero" };
    expect(createHardBot(seededRng(3)).chooseAction(view, [quiero, noQuiero], 50)).toBe(noQuiero);
  });
});

describe("createHardBot — 2v2 team card play: the partner's card is part of the trick, not scenery", () => {
  const TEAMMATE = "player-c" as PlayerId;
  const OPPONENT_2 = "player-d" as PlayerId;

  /** A full 2v2 view: one teammate, two opponents, per-test trick plays.
   * Same minimal-fixture spirit as `viewWith` above, widened to the fields
   * the team-aware branches actually read. */
  function viewWith2v2(overrides: {
    hand: readonly Card[];
    currentTrickPlays?: readonly HandPlay[];
    opponentsCardsRemaining?: number;
  }): PlayerView {
    const cardsRemaining = overrides.opponentsCardsRemaining ?? 3;
    return {
      self: { playerId: SELF, teamId: SELF_TEAM, seat: 0, hand: overrides.hand, lastSena: null, senasRemaining: MAX_SENAS_PER_HAND },
      teammates: [{ playerId: TEAMMATE, seat: 2, cardsRemaining, lastSena: null }],
      opponents: [
        { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining },
        { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, cardsRemaining },
      ],
      teams: [{ id: SELF_TEAM, score: 0 }, { id: OPPONENT_TEAM, score: 0 }],
      hand: {
        manoSeat: 0,
        truco: { status: "none" },
        envido: { status: "none" },
        turnSeat: 0,
        currentTrickPlays: overrides.currentTrickPlays ?? [],
        resolvedTrickPlays: [],
        callEvents: [],
        trickOutcomes: [],
        outcome: { decided: false },
      },
      config: { pointsToWin: 15 },
      dealerSeat: 1,
    };
  }

  // (a1) — the bot closes a trick its partner already won. Same fixture and
  // both-orders discipline as the normal tier's own test: partner's espada-1
  // beats the strongest opposing espada-3, so `scoreFollowingCardPlay`'s
  // "cheapest card that still wins" (basto-1) would only outdo the PARTNER.
  describe("closing a trick the partner already secured — dumps the cheapest card instead of beating the opposition", () => {
    function securedTrickView(): PlayerView {
      return viewWith2v2({
        hand: [{ suit: "basto", rank: 1 }, { suit: "copa", rank: 4 }],
        opponentsCardsRemaining: 2,
        currentTrickPlays: [
          { playerId: TEAMMATE, teamId: SELF_TEAM, seat: 2, card: { suit: "espada", rank: 1 } },
          { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: { suit: "espada", rank: 3 } },
          { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, card: { suit: "oro", rank: 5 } },
        ],
      });
    }
    const winner: Action = { type: "play-card", playerId: SELF, card: { suit: "basto", rank: 1 } };
    const dump: Action = { type: "play-card", playerId: SELF, card: { suit: "copa", rank: 4 } };

    it("dumps the cheapest card when the beat-it-cheaply candidate is offered first", () => {
      expect(createHardBot(seededRng(5)).chooseAction(securedTrickView(), [winner, dump], 50)).toBe(dump);
    });

    it("dumps the cheapest card when the dump is offered first (same choice, opposite order)", () => {
      expect(createHardBot(seededRng(5)).chooseAction(securedTrickView(), [dump, winner], 50)).toBe(dump);
    });

    it("control: the partner's play LOSES to the opposition — beats it cheaply exactly as before", () => {
      const view = viewWith2v2({
        hand: [{ suit: "basto", rank: 1 }, { suit: "copa", rank: 4 }],
        opponentsCardsRemaining: 2,
        currentTrickPlays: [
          { playerId: TEAMMATE, teamId: SELF_TEAM, seat: 2, card: { suit: "copa", rank: 5 } }, // power 2 — loses to espada-3
          { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: { suit: "espada", rank: 3 } },
          { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, card: { suit: "oro", rank: 5 } },
        ],
      });
      expect(createHardBot(seededRng(5)).chooseAction(view, [dump, winner], 50)).toBe(winner);
    });
  });

  // There is deliberately NO "partner led, bot acts second, no opposing play
  // yet" case here, because that state cannot exist (native review WARNING,
  // review-1c7acbeec743da97): teams are seat parity and a trick rotates
  // strictly seat+1, so the seat before this bot is always an opponent — a
  // non-empty trick always carries an opposing play, and the follow branch
  // above owns it. A test for it would be a synthetic view no real match can
  // produce, pinning behavior nobody can ever observe.
});
