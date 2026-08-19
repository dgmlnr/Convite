import { describe, expect, it } from "vitest";
import type { Action, Card, HandPlay, PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
import type { RandomSource } from "@hexdev/platform-contract";
import { createNormalBot } from "./normal.js";

/** A draw that never crosses the seña-emission gate — these tests exercise
 * the LADDER (none of them offers a `send-sena`, so the gate exits before
 * drawing anyway; see sena-emission.test.ts for the gate's own coverage). */
const gateShutRng: RandomSource = () => 0.99;

const SELF = "player-a" as PlayerId;
const OPPONENT = "player-b" as PlayerId;
const SELF_TEAM = "player-a:team" as TeamId;
const OPPONENT_TEAM = "player-b:team" as TeamId;

function viewWith(overrides: {
  hand: readonly Card[];
  currentTrickPlays?: readonly HandPlay[];
  teammates?: PlayerView["teammates"];
  opponents?: PlayerView["opponents"];
}): PlayerView {
  return {
    self: { playerId: SELF, teamId: SELF_TEAM, seat: 0, hand: overrides.hand, lastSena: null, senasRemaining: MAX_SENAS_PER_HAND },
    teammates: overrides.teammates ?? [],
    opponents: overrides.opponents ?? [{ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 3 }],
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

describe("createNormalBot — weighted heuristics with light lookahead", () => {
  it("throws when given no legal actions", () => {
    expect(() => createNormalBot(gateShutRng).chooseAction(viewWith({ hand: [] }), [], 50)).toThrow();
  });

  it("following a visible opponent card: plays the cheapest card that still wins", () => {
    const view = viewWith({
      hand: [{ suit: "basto", rank: 4 }],
      currentTrickPlays: [{ playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: { suit: "basto", rank: 4 } }],
    });
    const cheapWin: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 3 } }; // power 11, beats basto-4 (power 1)
    const expensiveWin: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 1 } }; // power 14, also beats it but overkill
    expect(createNormalBot(gateShutRng).chooseAction(view, [expensiveWin, cheapWin], 50)).toBe(cheapWin);
  });

  it("leading with no visible opponent card: plays the WEAKEST card, saving strength for later", () => {
    const view = viewWith({ hand: [] });
    const weak: Action = { type: "play-card", playerId: SELF, card: { suit: "basto", rank: 4 } };
    const strong: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 1 } };
    expect(createNormalBot(gateShutRng).chooseAction(view, [strong, weak], 50)).toBe(weak);
  });

  it("2v2: a TEAMMATE already played a WEAK card this trick, no opponent yet — treated as LEADING (conserves the weakest card), NOT as 'must beat the teammate's card' (the fixed bug: the old code read currentTrickPlays[0] as the opponent even when it was the teammate)", () => {
    const TEAMMATE = "player-c" as PlayerId;
    const view = viewWith({
      hand: [],
      teammates: [{ playerId: TEAMMATE, seat: 2, cardsRemaining: 3, lastSena: null }],
      currentTrickPlays: [{ playerId: TEAMMATE, teamId: SELF_TEAM, seat: 2, card: { suit: "basto", rank: 4 } }], // power 1, weakest group
    });
    // Under the OLD bug (teammate's basto-4 misread as the opponent's card):
    // oro-4 (power 1) ties it (parda score 499); espada-7 (power 12) clearly
    // "beats" it (score 988) — the bug would pick espada-7, needlessly
    // spending a strong card against its OWN teammate's play. Under the fix
    // (nothing opposing has played yet), the weakest card wins instead.
    const weak: Action = { type: "play-card", playerId: SELF, card: { suit: "oro", rank: 4 } };
    const strong: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 7 } };
    expect(createNormalBot(gateShutRng).chooseAction(view, [strong, weak], 50)).toBe(weak);
  });

  it("2v2: a TEAMMATE played, THEN an opponent played — follows the OPPONENT's card, ignoring the teammate's", () => {
    const TEAMMATE = "player-c" as PlayerId;
    const view = viewWith({
      hand: [],
      teammates: [{ playerId: TEAMMATE, seat: 2, cardsRemaining: 3, lastSena: null }],
      currentTrickPlays: [
        { playerId: TEAMMATE, teamId: SELF_TEAM, seat: 2, card: { suit: "espada", rank: 1 } },
        { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: { suit: "basto", rank: 4 } },
      ],
    });
    const cheapWin: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 3 } }; // beats basto-4, not espada-1
    const expensiveWin: Action = { type: "play-card", playerId: SELF, card: { suit: "espada", rank: 7 } };
    expect(createNormalBot(gateShutRng).chooseAction(view, [expensiveWin, cheapWin], 50)).toBe(cheapWin);
  });

  // The (a1) team-coordination gap, closed: `resolveTrick` awards a trick to
  // the TEAM's best play, so once the partner's card already beats every
  // opposing card AND this bot closes the trick (everyone else has played),
  // there is nothing left to beat — "beat the opposition cheaply" would only
  // outdo the bot's OWN partner, burning a winner for zero tricks. The right
  // move is the same conserve-strength dump the leading branch already makes.
  // Both argument orders are asserted (the tie-break PR's lesson: a
  // single-order test can pass by the reduce's incumbent rather than by the
  // choice being right).
  describe("2v2: partner's play already SECURED the trick and the bot closes it — dumps the cheapest card instead of beating the opposition", () => {
    const TEAMMATE = "player-c" as PlayerId;
    const OPPONENT_2 = "player-d" as PlayerId;

    /** One teammate, two opponents, all three already played this trick —
     * the bot acts last. Partner's espada-1 (power 14) beats the strongest
     * opposing play, espada-3 (power 10): the trick is already the team's. */
    function securedTrickView(): PlayerView {
      return viewWith({
        hand: [],
        teammates: [{ playerId: TEAMMATE, seat: 2, cardsRemaining: 2, lastSena: null }],
        opponents: [
          { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 2 },
          { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, cardsRemaining: 2 },
        ],
        currentTrickPlays: [
          { playerId: TEAMMATE, teamId: SELF_TEAM, seat: 2, card: { suit: "espada", rank: 1 } },
          { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: { suit: "espada", rank: 3 } },
          { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, card: { suit: "oro", rank: 5 } },
        ],
      });
    }

    // basto-1 (power 13) is the cheapest card that beats espada-3 — exactly
    // what the old scoring would burn here. copa-4 (power 1) wins nothing
    // and costs nothing: the correct dump for an already-won trick.
    const winner: Action = { type: "play-card", playerId: SELF, card: { suit: "basto", rank: 1 } };
    const dump: Action = { type: "play-card", playerId: SELF, card: { suit: "copa", rank: 4 } };

    it("dumps the cheapest card when the beat-it-cheaply candidate is offered first", () => {
      expect(createNormalBot(gateShutRng).chooseAction(securedTrickView(), [winner, dump], 50)).toBe(dump);
    });

    it("dumps the cheapest card when the dump is offered first (same choice, opposite order)", () => {
      expect(createNormalBot(gateShutRng).chooseAction(securedTrickView(), [dump, winner], 50)).toBe(dump);
    });

    it("control: the partner's play LOSES to the opposition — beats it cheaply exactly as before", () => {
      const view = viewWith({
        hand: [],
        teammates: [{ playerId: TEAMMATE, seat: 2, cardsRemaining: 2, lastSena: null }],
        opponents: [
          { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 2 },
          { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, cardsRemaining: 2 },
        ],
        currentTrickPlays: [
          { playerId: TEAMMATE, teamId: SELF_TEAM, seat: 2, card: { suit: "copa", rank: 5 } }, // power 2 — loses to espada-3
          { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, card: { suit: "espada", rank: 3 } },
          { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, card: { suit: "oro", rank: 5 } },
        ],
      });
      expect(createNormalBot(gateShutRng).chooseAction(view, [dump, winner], 50)).toBe(winner);
    });
  });

  it("declines a truco call with a clearly weak hand", () => {
    const weakHand: readonly Card[] = [{ suit: "basto", rank: 4 }, { suit: "copa", rank: 4 }, { suit: "oro", rank: 4 }];
    const view = viewWith({ hand: weakHand });
    const quiero: Action = { type: "respond-truco", playerId: SELF, response: "quiero" };
    const noQuiero: Action = { type: "respond-truco", playerId: SELF, response: "no-quiero" };
    expect(createNormalBot(gateShutRng).chooseAction(view, [quiero, noQuiero], 50)).toBe(noQuiero);
  });

  it("accepts a truco call with a clearly strong hand (triangulation: opposite of the weak case)", () => {
    const strongHand: readonly Card[] = [{ suit: "espada", rank: 1 }, { suit: "basto", rank: 1 }, { suit: "espada", rank: 7 }];
    const view = viewWith({ hand: strongHand });
    const quiero: Action = { type: "respond-truco", playerId: SELF, response: "quiero" };
    const noQuiero: Action = { type: "respond-truco", playerId: SELF, response: "no-quiero" };
    expect(createNormalBot(gateShutRng).chooseAction(view, [quiero, noQuiero], 50)).toBe(quiero);
  });

  it("volunteers a truco call only with a strong hand, preferring it over just playing a card", () => {
    const strongHand: readonly Card[] = [{ suit: "espada", rank: 1 }, { suit: "basto", rank: 1 }, { suit: "espada", rank: 7 }];
    const view = viewWith({ hand: strongHand });
    const callTruco: Action = { type: "call-truco", playerId: SELF, level: "truco" };
    const playCard: Action = { type: "play-card", playerId: SELF, card: strongHand[0]! };
    expect(createNormalBot(gateShutRng).chooseAction(view, [callTruco, playCard], 50)).toBe(callTruco);
  });

  it("does NOT volunteer a truco call with a weak hand, playing a card instead", () => {
    const weakHand: readonly Card[] = [{ suit: "basto", rank: 4 }, { suit: "copa", rank: 4 }, { suit: "oro", rank: 4 }];
    const view = viewWith({ hand: weakHand });
    const callTruco: Action = { type: "call-truco", playerId: SELF, level: "truco" };
    const playCard: Action = { type: "play-card", playerId: SELF, card: weakHand[0]! };
    expect(createNormalBot(gateShutRng).chooseAction(view, [callTruco, playCard], 50)).toBe(playCard);
  });
});
