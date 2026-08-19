import { describe, expect, it } from "vitest";
import type { Action, Card, DealInput, PlayerId, PlayerView, TeamId } from "@hexdev/truco-engine";
import { MAX_SENAS_PER_HAND, SENA_SIGNALS, createHeadToHeadMatch, createTeamMatch, getLegalActions, startHand } from "@hexdev/truco-engine";
import type { RandomSource } from "@hexdev/platform-contract";
import { createEasyBot } from "./easy.js";
import { createHardBot } from "./hard.js";
import { createNormalBot } from "./normal.js";
import { chooseSenaEmission } from "./sena-emission.js";

const SELF = "player-a" as PlayerId;
const OPPONENT = "player-b" as PlayerId;
const TEAMMATE = "player-c" as PlayerId;
const OPPONENT_2 = "player-d" as PlayerId;
const SELF_TEAM = "player-a:team" as TeamId;
const OPPONENT_TEAM = "player-b:team" as TeamId;

/** Same generator as hard.test.ts / the tournament — only the hard tier's
 * SAMPLING needs it here; every gate decision below is pinned with scripted
 * draws instead, so no test depends on hunting a lucky seed. */
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

/** Scripted prefix, seeded tail: the first draws are the exact values a test
 * needs the emission gate to see (cross / not cross / bluff), and anything a
 * tier draws AFTER the gate (the hard tier's determinized sampling) falls
 * through to an ordinary seeded stream instead of exploding. */
function scriptedRng(values: readonly number[], tail: RandomSource = seededRng(1)): RandomSource {
  let index = 0;
  return () => (index < values.length ? values[index++]! : tail());
}

/** A draw that must never happen — proves a code path consumes NO rng, which
 * is the 1v1-byte-identical argument in executable form. */
const forbiddenRng: RandomSource = () => {
  throw new Error("this path must not consume the rng");
};

/** 2v2-shaped view: one teammate, two opponents — the shape in which the
 * engine actually offers señas. */
function viewWith(overrides: { hand: readonly Card[]; lastSena?: PlayerView["self"]["lastSena"]; senasRemaining?: number }): PlayerView {
  return {
    self: {
      playerId: SELF,
      teamId: SELF_TEAM,
      seat: 0,
      hand: overrides.hand,
      lastSena: overrides.lastSena ?? null,
      senasRemaining: overrides.senasRemaining ?? MAX_SENAS_PER_HAND,
    },
    teammates: [{ playerId: TEAMMATE, seat: 2, cardsRemaining: 3, lastSena: null }],
    opponents: [
      { playerId: OPPONENT, teamId: OPPONENT_TEAM, seat: 1, cardsRemaining: 3 },
      { playerId: OPPONENT_2, teamId: OPPONENT_TEAM, seat: 3, cardsRemaining: 3 },
    ],
    teams: [{ id: SELF_TEAM, score: 0 }, { id: OPPONENT_TEAM, score: 0 }],
    hand: {
      manoSeat: 0,
      truco: { status: "none" },
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

/** The engine's all-or-nothing offer (senas.ts: "the cap limits HOW MANY,
 * never WHICH"): whenever señas are legal at all, all six signals are. */
const senaActions: readonly Action[] = SENA_SIGNALS.map((signal) => ({ type: "send-sena", playerId: SELF, signal }));

const playCard: Action = { type: "play-card", playerId: SELF, card: { suit: "copa", rank: 4 } };

/** Holds the as de espada (the strongest claimable card) AND a siete de oro —
 * the emission must claim the STRONGER of the two. The copa-4 is noise. */
const SIGNALABLE_HAND: readonly Card[] = [
  { suit: "copa", rank: 4 },
  { suit: "oro", rank: 7 },
  { suit: "espada", rank: 1 },
];

/** No rank 1/2/3/7-of-the-right-suit anywhere: nothing in the seña vocabulary
 * matches, so there is nothing honest to claim. */
const UNSIGNALABLE_HAND: readonly Card[] = [
  { suit: "copa", rank: 5 },
  { suit: "basto", rank: 6 },
  { suit: "oro", rank: 12 },
];

describe("seña emission — normal tier", () => {
  it("signals its strongest signalable card when the gate draw crosses (2v2: señas offered alongside a blocking play)", () => {
    const bot = createNormalBot(scriptedRng([0.2])); // 0.2 < the normal emit rate — the gate opens
    const action = bot.chooseAction(viewWith({ hand: SIGNALABLE_HAND }), [...senaActions, playCard], 50) as Action;
    expect(action).toEqual({ type: "send-sena", playerId: SELF, signal: "asDeEspada" });
  });

  it("keeps quiet when the gate draw does not cross — the ladder proceeds exactly as before", () => {
    const bot = createNormalBot(scriptedRng([0.9])); // 0.9 clears every emit rate — the gate stays shut
    expect(bot.chooseAction(viewWith({ hand: SIGNALABLE_HAND }), [...senaActions, playCard], 50)).toBe(playCard);
  });

  it("holds nothing worth claiming: no seña, and the gate consumes NO draw deciding that", () => {
    const bot = createNormalBot(forbiddenRng);
    expect(bot.chooseAction(viewWith({ hand: UNSIGNALABLE_HAND }), [...senaActions, playCard], 50)).toBe(playCard);
  });

  it("never re-buys the claim it already made this hand (lastSena guard)", () => {
    const view = viewWith({ hand: SIGNALABLE_HAND, lastSena: { signal: "asDeEspada", seq: 1 } });
    const bot = createNormalBot(scriptedRng([0.2])); // gate crosses, but the claim is already standing
    expect(bot.chooseAction(view, [...senaActions, playCard], 50)).toBe(playCard);
  });

  it("no send-sena offered (1v1 always; 2v2 at the quota cap): the gate is structurally inert and consumes NO rng", () => {
    // The engine never offers send-sena to a player without a teammate, and
    // at the cap the whole list goes empty at once — in both states the only
    // honest bot behavior is "the ladder, untouched". The forbidden rng is
    // the proof this costs zero draws, which is exactly why a 1v1 seeded
    // line cannot move: the same draws happen in the same order as before.
    const bot = createNormalBot(forbiddenRng);
    expect(bot.chooseAction(viewWith({ hand: SIGNALABLE_HAND, senasRemaining: 0 }), [playCard], 50)).toBe(playCard);
  });
});

describe("seña emission — hard tier", () => {
  it("signals honestly when the gate draw crosses and the bluff draw does not", () => {
    const bot = createHardBot(scriptedRng([0.5, 0.5])); // 0.5 < hard's emit rate; 0.5 >= the bluff rate
    const action = bot.chooseAction(viewWith({ hand: SIGNALABLE_HAND }), [...senaActions, playCard], 50) as Action;
    expect(action).toEqual({ type: "send-sena", playerId: SELF, signal: "asDeEspada" });
  });

  it("bluffs a signal it does NOT hold when the bluff draw crosses (senas.ts: a seña is a claim, not a verified statement)", () => {
    // 0.5 opens the gate, 0.05 crosses the bluff rate, 0.99 indexes the LAST
    // vocabulary entry ("dos") — which this hand does not contain.
    const bot = createHardBot(scriptedRng([0.5, 0.05, 0.99]));
    const action = bot.chooseAction(viewWith({ hand: SIGNALABLE_HAND }), [...senaActions, playCard], 50) as Action;
    expect(action).toEqual({ type: "send-sena", playerId: SELF, signal: "dos" });
  });

  it("keeps quiet when the gate draw does not cross — sampling and the ladder proceed exactly as before", () => {
    const bot = createHardBot(scriptedRng([0.9])); // gate shut; the seeded tail then feeds the sampler
    expect(bot.chooseAction(viewWith({ hand: SIGNALABLE_HAND }), [...senaActions, playCard], 50)).toBe(playCard);
  });
});

describe("seña emission — easy tier", () => {
  it("the beginner never signals: a card play always wins over an offered seña", () => {
    expect(createEasyBot().chooseAction(viewWith({ hand: SIGNALABLE_HAND }), [...senaActions, playCard], 50)).toBe(playCard);
  });

  it("even a proactive truco call outranks a seña — señas are dead last, whatever order the list arrives in", () => {
    // Señas FIRST in the offered list, deliberately: under a shared lowest
    // priority group the reduce's incumbent would be the seña, so only an
    // explicit below-everything rank keeps the beginner silent here.
    const callTruco: Action = { type: "call-truco", playerId: SELF, level: "truco" };
    expect(createEasyBot().chooseAction(viewWith({ hand: SIGNALABLE_HAND }), [...senaActions, callTruco], 50)).toBe(callTruco);
  });
});

describe("señas-only legal list — the contract's only legal answer, pinned (native review WARNING, review-118b56fc71111407)", () => {
  // When señas are the ONLY legal actions, the emission gate refuses (its
  // own all-señas exit below) but `chooseAction` must still pick FROM THE
  // LIST — so the fallback returns a seña, and that is contract compliance,
  // not an emission leak. Unreachable through the transport (`findActingBot`
  // only drives a bot holding a blocking action); pinned here so the
  // fallback's `??` arm is a documented decision instead of an accident.
  it("hard: returns a legal seña rather than violating the contract", () => {
    // A seeded rng, not the forbidden one: the hard tier samples its rounds
    // unconditionally after the gate, so this path legitimately draws — the
    // no-draw guarantee belongs to the gate's exits, not to the whole tier.
    const action = createHardBot(seededRng(1)).chooseAction(viewWith({ hand: SIGNALABLE_HAND }), [...senaActions], 50) as Action;
    expect(action.type).toBe("send-sena");
  });

  it("normal: returns a legal seña rather than violating the contract", () => {
    const action = createNormalBot(forbiddenRng).chooseAction(viewWith({ hand: SIGNALABLE_HAND }), [...senaActions], 50) as Action;
    expect(action.type).toBe("send-sena");
  });
});

describe("chooseSenaEmission — the shared gate's own structural exits", () => {
  const policy = { emitRate: 1, bluffRate: 0 }; // a gate that ALWAYS crosses, so only the structural exits can say no

  it("no send-sena in the legal list: exits before ANY draw (the 1v1-untouched proof for every tier that samples afterwards)", () => {
    expect(chooseSenaEmission(viewWith({ hand: SIGNALABLE_HAND }), [playCard], forbiddenRng, policy)).toBeUndefined();
  });

  it("send-sena is the ONLY thing on offer: refuses, so a bot never volunteers a seña without a blocking action to take next", () => {
    // The transport only drives a bot that owes a blocking action
    // (`findActingBot`), so this state is unreachable there — the exit keeps
    // the gate honest for ANY caller, and it is half of the termination
    // argument: a seña is only ever returned when the SAME call could have
    // returned a real move instead.
    expect(chooseSenaEmission(viewWith({ hand: SIGNALABLE_HAND }), [...senaActions], forbiddenRng, policy)).toBeUndefined();
  });

  it("nothing claimable in hand: exits before the draw as well", () => {
    expect(chooseSenaEmission(viewWith({ hand: UNSIGNALABLE_HAND }), [...senaActions, playCard], forbiddenRng, policy)).toBeUndefined();
  });

  it("a bluff cannot ride on nothing: even a bluff-heavy policy stays silent with no genuine signal in hand (native review SUGGESTION)", () => {
    // The held-check exit precedes both the emit and bluff draws by design —
    // a bluff rides on a real decision to signal, it is not a reason to
    // invent one. forbiddenRng proves the exit costs zero draws too.
    const bluffy = { emitRate: 1, bluffRate: 1 };
    expect(chooseSenaEmission(viewWith({ hand: UNSIGNALABLE_HAND }), [...senaActions, playCard], forbiddenRng, bluffy)).toBeUndefined();
  });

  it("an rng edge of exactly 1 on the bluff index picks the LAST vocabulary entry instead of silently declining (clamped)", () => {
    // Draws: 0 crosses emitRate, 0 crosses bluffRate, 1 would index one past
    // the vocabulary without the clamp — with it, the pick is "dos".
    const bluffy = { emitRate: 1, bluffRate: 1 };
    const edgeRng = (() => {
      const values = [0, 0, 1];
      let i = 0;
      return () => values[i++] ?? 0;
    })();
    const action = chooseSenaEmission(viewWith({ hand: SIGNALABLE_HAND }), [...senaActions, playCard], edgeRng, bluffy);
    expect(action).toEqual({ type: "send-sena", playerId: SELF, signal: "dos" });
  });
});

describe("señas offered alongside a pending call response — the flash-then-answer flow (native review WARNING, review-d7646537df287e42)", () => {
  // The engine keeps señas continuously legal while a truco/envido response
  // is pending, so the combined list is a REAL production state. The gate
  // running before the respond branches is deliberate: signalling before
  // answering is legitimate truco — the flash tells the partner what the
  // hand holds before the quiero lands — and the driving loop re-drives
  // after the non-blocking seña, so the answer still arrives on the very
  // next call, bounded by the quota as always.
  const respondTruco: Action = { type: "respond-truco", playerId: SELF, response: "quiero" };
  const noQuiero: Action = { type: "respond-truco", playerId: SELF, response: "no-quiero" };

  it("normal, gate crosses: flashes the seña first — the pending answer waits exactly one drive", () => {
    const bot = createNormalBot(scriptedRng([0.2]));
    const action = bot.chooseAction(viewWith({ hand: SIGNALABLE_HAND }), [...senaActions, respondTruco, noQuiero], 50) as Action;
    expect(action).toEqual({ type: "send-sena", playerId: SELF, signal: "asDeEspada" });
  });

  it("normal, gate shut: answers the pending call exactly as the ladder always did", () => {
    const bot = createNormalBot(scriptedRng([0.9]));
    const action = bot.chooseAction(viewWith({ hand: SIGNALABLE_HAND }), [...senaActions, respondTruco, noQuiero], 50) as Action;
    expect(action.type).toBe("respond-truco");
  });
});

describe("señas legality — engine cross-check the emission gate leans on", () => {
  // Three arbitrary legal hands per seat; the deal's content is irrelevant —
  // only WHO is offered send-sena matters here.
  const dealFor = (seatCount: number): DealInput =>
    Array.from({ length: seatCount }, (_, seat) => [
      { suit: "espada", rank: (seat + 4) as 4 | 5 | 6 | 7 },
      { suit: "basto", rank: (seat + 4) as 4 | 5 | 6 | 7 },
      { suit: "oro", rank: (seat + 4) as 4 | 5 | 6 | 7 },
    ]);

  it("a REAL 1v1 match never offers send-sena to either player — the gate is unreachable there by construction", () => {
    const state = startHand(createHeadToHeadMatch({ playerAId: SELF, playerBId: OPPONENT, pointsToWin: 15 }), dealFor(2));
    for (const playerId of [SELF, OPPONENT]) {
      expect(getLegalActions(state, playerId).some((action) => action.type === "send-sena")).toBe(false);
    }
  });

  it("control: the same probe on a REAL 2v2 match offers señas to a seated player", () => {
    const state = startHand(createTeamMatch({ seatOrder: [SELF, OPPONENT, TEAMMATE, OPPONENT_2], pointsToWin: 15 }), dealFor(4));
    expect(getLegalActions(state, SELF).some((action) => action.type === "send-sena")).toBe(true);
  });
});
