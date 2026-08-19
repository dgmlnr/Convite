import { describe, expect, it } from "vitest";
import type { Action, Card, HandPlay, PlayerId, PlayerView, SenaView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND, buildDeck } from "@hexdev/truco-engine";
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

  // What IS pinned for 2v2 leading (native review WARNING,
  // review-f1c06a90d7ba1f9b): the partner draws in `sampleHiddenHands`
  // advance the shared rng stream between rounds, so a fixed seed replays
  // different — equally valid — rounds than the pre-partner sampler, and a
  // NEAR-TIE leading choice may land differently. The dominant choice must
  // not: espada-1 wins every sampled round (it is the top card and in the
  // bot's own hand, so no pool can hold it — 24/24 for ANY rng), and basto-4
  // can win none (a round needs 1 > max(pool), and every card's power is at
  // least 1). Score 24 vs 0, both argument orders — whatever the partner
  // draws do to the stream.
  describe("leading a fresh 2v2 trick — the dominant card survives the partner draws' rng-stream offset, for any rng", () => {
    const strong: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 1 } };
    const weak: Action = { type: "play-card", playerId: SELF, card: { suit: "basto", rank: 4 } };
    const bothCards: readonly Card[] = [{ suit: "espada", rank: 1 }, { suit: "basto", rank: 4 }];

    it("plays the dominant card when it is offered first", () => {
      const view = viewWith2v2({ hand: bothCards });
      expect(createHardBot(seededRng(7)).chooseAction(view, [strong, weak], 50)).toBe(strong);
    });

    it("plays the dominant card when the weak one is offered first (same choice, opposite order)", () => {
      const view = viewWith2v2({ hand: bothCards });
      expect(createHardBot(seededRng(7)).chooseAction(view, [weak, strong], 50)).toBe(strong);
    });
  });
});

describe("createHardBot — 2v2 team calls: the PARTNER's sampled hand counts toward the team's side (the closed own-hand-only gap)", () => {
  const TEAMMATE = "player-c" as PlayerId;
  const OPPONENT_2 = "player-d" as PlayerId;

  /** A 2v2 call-decision view: one teammate, two opponents, per-test hand
   * sizes and call state. Same minimal-fixture spirit as `viewWith` above,
   * widened to the fields the team-side metrics actually read. */
  function viewWithTeamCall(overrides: {
    hand: readonly Card[];
    teammateCardsRemaining?: number;
    opponentsCardsRemaining?: [number, number];
    trucoPending?: boolean;
    envidoPending?: boolean;
  }): PlayerView {
    const [opp1Cards, opp2Cards] = overrides.opponentsCardsRemaining ?? [3, 3];
    return {
      self: { playerId: SELF, teamId: SELF_TEAM, seat: 0, hand: overrides.hand, lastSena: null, senasRemaining: MAX_SENAS_PER_HAND },
      teammates: [{ playerId: TEAMMATE, seat: 2, cardsRemaining: overrides.teammateCardsRemaining ?? 3, lastSena: null }],
      opponents: [
        { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: opp1Cards },
        { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, cardsRemaining: opp2Cards },
      ],
      teams: [{ id: SELF_TEAM, score: 0 }, { id: OPPONENT_TEAM, score: 0 }],
      hand: {
        manoSeat: 0,
        truco: overrides.trucoPending === true ? { status: "pending", level: "truco", callingTeamId: OPPONENT_TEAM } : { status: "none" },
        envido: overrides.envidoPending === true ? { status: "pending", calls: ["envido"], callingTeamId: OPPONENT_TEAM } : { status: "none" },
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

  const quieroTruco: Action = { type: "respond-truco", playerId: SELF, response: "quiero" };
  const noQuieroTruco: Action = { type: "respond-truco", playerId: SELF, response: "no-quiero" };
  const quieroEnvido: Action = { type: "respond-envido", playerId: SELF, response: "quiero" };
  const noQuieroEnvido: Action = { type: "respond-envido", playerId: SELF, response: "no-quiero" };

  // (G4) — truco strength is a TEAM quantity. Same synthetic-but-pointed
  // construction as the 0-card-opponent test above, taken to its fixed point
  // so the flip is deterministic for ANY rng, not one seed's luck: the bot's
  // own hand is empty and both opponents are out of cards, so every quantity
  // EXCEPT the partner's sample is pinned at exactly 0 (`handPower([])`).
  // Own-hand-only scoring — the pre-slice model — loses every round here
  // (0 > 0 never holds): it answered no-quiero. The team side counts the
  // partner's sampled hand, and every card in the deck has power >= 1
  // (card-power.ts's weakest group), so a 3-card partner sample makes the
  // team side >= 3 in EVERY round: quiero, whatever the rng draws.
  it("accepts a truco call on the PARTNER's sampled strength alone — own and opposing sides both pinned at zero, deterministic for any rng", () => {
    const view = viewWithTeamCall({ hand: [], opponentsCardsRemaining: [0, 0], trucoPending: true });
    expect(createHardBot(seededRng(3)).chooseAction(view, [quieroTruco, noQuieroTruco], 50)).toBe(quieroTruco);
  });

  it("control (1v1): the same empty hand with no teammate still declines — every partner branch is gated on view.teammates being non-empty", () => {
    const view = viewWith({ hand: [], cardsRemaining: 0 });
    expect(createHardBot(seededRng(3)).chooseAction(view, [quieroTruco, noQuieroTruco], 50)).toBe(noQuieroTruco);
  });

  // (G3) — envido is a TEAM contest in the engine itself (all four declare,
  // the best declaration wins — `resolveEnvidoDeclarations`), so the team
  // side is max(own, partner) by RULE, not by proxy. A 26-point hand sits
  // near the middle of the best-of-two-opponents distribution, which is what
  // makes it a boundary: own-hand-only scoring wins just 7 of 24 sampled
  // rounds here (no-quiero — measured against the pre-slice build), while
  // counting the partner's sampled points lifts the team side to 14 of 24
  // (quiero). Seed-dependent by nature, like the leading-trick test above,
  // and disclosed the same way: deterministic for the fixed seeded rng used
  // here, not for every rng.
  it("flips respond-envido to quiero once the partner's sampled points count for the team (26-point boundary hand, fixed seed)", () => {
    const boundaryHand: readonly Card[] = [{ suit: "copa", rank: 2 }, { suit: "copa", rank: 4 }, { suit: "oro", rank: 10 }];
    const view = viewWithTeamCall({ hand: boundaryHand, envidoPending: true });
    expect(createHardBot(seededRng(5)).chooseAction(view, [quieroEnvido, noQuieroEnvido], 50)).toBe(quieroEnvido);
  });

  it("control (1v1): the same 26-point hand against a single opponent answers quiero exactly as it did before the slice (15 of 24 rounds — no partner sample involved)", () => {
    const boundaryHand: readonly Card[] = [{ suit: "copa", rank: 2 }, { suit: "copa", rank: 4 }, { suit: "oro", rank: 10 }];
    const view = viewWith({ hand: boundaryHand });
    expect(createHardBot(seededRng(5)).chooseAction(view, [quieroEnvido, noQuieroEnvido], 50)).toBe(quieroEnvido);
  });
});

describe("createHardBot — 2v2 seña reading (slice 4): the partner's claimed mata flips a boundary respond-truco", () => {
  const TEAMMATE = "player-c" as PlayerId;
  const OPPONENT_2 = "player-d" as PlayerId;
  const MATA_CLAIM: SenaView = { signal: "asDeEspada", seq: 1 };

  /** The pool this view leaves unseen: espada-1 (power 14, the claimed mata)
   * plus all four 4s (power 1) and all four 5s (power 2) — nine cards. Every
   * other card sits face up in a synthetic resolved-trick log (`seenCards`
   * only flattens; nothing validates trick shape), which pins the whole
   * determinization to a pool where the mata is the ONLY card that matters. */
  const POOL_IDS = new Set(
    ["1-espada", "4-espada", "4-basto", "4-oro", "4-copa", "5-espada", "5-basto", "5-oro", "5-copa"],
  );
  const seenPlays: readonly HandPlay[] = buildDeck()
    .filter((card) => !POOL_IDS.has(`${card.rank}-${card.suit}`))
    .map((card) => ({ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card }));

  /** Own hand EMPTY (own side pinned at handPower 0), one-card opponents and
   * a one-card partner drawn from the nine-card pool above. Per sampled
   * round the team side is exactly the partner's single card and the
   * opposing side the stronger of two singles — so a round is won only when
   * the partner's card outranks both, and in this pool that effectively
   * means "the partner holds the mata" (a 5 over two 4s is the one other
   * way). The seña is the only lever this fixture leaves. */
  function boundaryView(partnerLastSena: SenaView | null): PlayerView {
    return {
      self: { playerId: SELF, teamId: SELF_TEAM, seat: 0, hand: [], lastSena: null, senasRemaining: MAX_SENAS_PER_HAND },
      teammates: [{ playerId: TEAMMATE, seat: 2, cardsRemaining: 1, lastSena: partnerLastSena }],
      opponents: [
        { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 1 },
        { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, cardsRemaining: 1 },
      ],
      teams: [{ id: SELF_TEAM, score: 0 }, { id: OPPONENT_TEAM, score: 0 }],
      hand: {
        manoSeat: 0,
        truco: { status: "pending", level: "truco", callingTeamId: OPPONENT_TEAM },
        envido: { status: "none" },
        turnSeat: 0,
        currentTrickPlays: [],
        resolvedTrickPlays: [seenPlays],
        callEvents: [],
        trickOutcomes: [],
        outcome: { decided: false },
      },
      config: { pointsToWin: 15 },
      dealerSeat: 1,
    };
  }

  const quiero: Action = { type: "respond-truco", playerId: SELF, response: "quiero" };
  const noQuiero: Action = { type: "respond-truco", playerId: SELF, response: "no-quiero" };

  // The flip, both halves under the SAME seed. Without the seña the partner
  // draws uniformly: the mata reaches them in roughly 1 round in 9, and the
  // team side loses the rest — no-quiero by a wide margin. With the claim
  // believed (SENA_TRUST of the rounds where the mata survived the opponent
  // draws — it is stolen into an opponent sample in about 2 rounds in 9,
  // where the claim is dead in that round's pool and the draw is unbiased),
  // the partner holds it in most rounds and the team side wins them:
  // quiero. Seed-dependent by nature — the trust coin is an rng draw — and
  // disclosed exactly like the 26-point envido boundary above: deterministic
  // for the fixed seeded rng used here, not for every rng.
  it("flips respond-truco to quiero when the partner's seña claims the as de espada (the team side's sampled strength rises)", () => {
    expect(createHardBot(seededRng(3)).chooseAction(boundaryView(MATA_CLAIM), [quiero, noQuiero], 50)).toBe(quiero);
  });

  it("control: the same view with lastSena null keeps the old answer — no-quiero", () => {
    expect(createHardBot(seededRng(3)).chooseAction(boundaryView(null), [quiero, noQuiero], 50)).toBe(noQuiero);
  });
});
