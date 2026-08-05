import { describe, expect, it } from "vitest";
import type { Card } from "./card.js";
import { calculateEnvidoPoints } from "./envido-chain.js";
import type { PlayerId } from "./ids.js";
import { createHeadToHeadMatch, startHand } from "./match.js";
import type { EnvidoCallLevel, MatchState } from "./match.js";
import { applyAction, getLegalActions } from "./truco-chain.js";
import type { Action } from "./truco-chain.js";

const playerA = "player-a" as PlayerId;
const playerB = "player-b" as PlayerId;

/** playerA holds a strong envido (33), playerB a weak one (5) — deterministic reveal winner below. */
function freshHand(): MatchState {
  const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 30 });
  return startHand(state, [
    [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }, { suit: "oro", rank: 3 }],
    [{ suit: "basto", rank: 5 }, { suit: "copa", rank: 10 }, { suit: "oro", rank: 2 }],
  ]);
}

function apply(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`expected legal action, got violation: ${result.violation}`);
  return result.state;
}

/** Escalates the envido chain through `levels`, alternating caller/responder (only the non-calling team may respond), leaving the last level pending. */
function pendingEnvidoAt(levels: readonly EnvidoCallLevel[]): MatchState {
  let state = freshHand();
  let caller = playerA;
  let responder = playerB;
  for (const level of levels) {
    state = apply(state, { type: "call-envido", playerId: caller, level });
    [caller, responder] = [responder, caller];
  }
  return state;
}

describe("getLegalActions — envido opens alongside truco, then gates it", () => {
  it("either player may open truco or envido when nothing is pending, but not envido once truco is already called (no card-play state to bound it yet)", () => {
    expect(getLegalActions(freshHand(), playerA)).toEqual([
      { type: "call-truco", playerId: playerA, level: "truco" },
      { type: "call-envido", playerId: playerA, level: "envido" },
    ]);
    const called = apply(freshHand(), { type: "call-truco", playerId: playerA, level: "truco" });
    expect(getLegalActions(called, playerB).some((a) => a.type === "call-envido")).toBe(false);
  });

  it.each([
    ["pending", pendingEnvidoAt(["envido"])],
    ["accepted-awaiting-reveal", apply(pendingEnvidoAt(["envido"]), { type: "respond-envido", playerId: playerB, response: "quiero" })],
  ])("an envido call that is %s blocks truco for both players (spec: envido resolves before truco)", (_label, state) => {
    expect(getLegalActions(state, playerA).some((a) => a.type.includes("truco"))).toBe(false);
    expect(getLegalActions(state, playerB).some((a) => a.type.includes("truco"))).toBe(false);
  });

  it("truco opens again once envido has resolved (declined)", () => {
    const declined = apply(pendingEnvidoAt(["envido"]), { type: "respond-envido", playerId: playerB, response: "no-quiero" });
    expect(getLegalActions(declined, playerA)).toContainEqual({ type: "call-truco", playerId: playerA, level: "truco" });
  });
});

describe("getLegalActions — envido escalation", () => {
  it("only the non-calling team may respond or escalate, may skip a level, and falta envido is offered as the final escalation", () => {
    const state = pendingEnvidoAt(["envido"]);
    expect(getLegalActions(state, playerA).some((a) => a.type !== "call-truco")).toBe(false);
    expect(getLegalActions(state, playerB)).toEqual([
      { type: "respond-envido", playerId: playerB, response: "quiero" },
      { type: "respond-envido", playerId: playerB, response: "no-quiero" },
      { type: "call-envido", playerId: playerB, level: "envidoEnvido" },
      { type: "call-envido", playerId: playerB, level: "realEnvido" },
      { type: "call-envido", playerId: playerB, level: "faltaEnvido" },
    ]);
    const skipped = apply(state, { type: "call-envido", playerId: playerB, level: "realEnvido" }); // skips envido-envido
    expect(skipped.hand?.envido).toMatchObject({ status: "pending", calls: ["envido", "realEnvido"] });
    expect(getLegalActions(skipped, playerA)).toEqual([
      { type: "respond-envido", playerId: playerA, response: "quiero" },
      { type: "respond-envido", playerId: playerA, response: "no-quiero" },
      { type: "call-envido", playerId: playerA, level: "faltaEnvido" }, // still escalatable to falta
    ]);
  });

  it("falta envido pending has no further escalation for either team", () => {
    const faltaPending = apply(pendingEnvidoAt(["envido"]), { type: "call-envido", playerId: playerB, level: "faltaEnvido" });
    expect(getLegalActions(faltaPending, playerA)).toEqual([
      { type: "respond-envido", playerId: playerA, response: "quiero" },
      { type: "respond-envido", playerId: playerA, response: "no-quiero" },
    ]);
  });
});

describe("applyAction — falta envido's accepted value overrides the chain (spec: 'Falta envido cost is dynamic')", () => {
  it("awards exactly pointsToWin minus the leading team's score, NOT the sum of the prior calls plus falta (regression: PR5 caught 37 instead of 6)", () => {
    const base = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 30 });
    const leading: MatchState = { ...base, teams: [{ ...base.teams[0]!, score: 24 }, base.teams[1]!] };
    const dealt = startHand(leading, [
      [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }, { suit: "oro", rank: 3 }],
      [{ suit: "basto", rank: 5 }, { suit: "copa", rank: 10 }, { suit: "oro", rank: 2 }],
    ]);
    const pending = apply(
      apply(dealt, { type: "call-envido", playerId: playerA, level: "envido" }),
      { type: "call-envido", playerId: playerB, level: "faltaEnvido" },
    );

    const accepted = apply(pending, { type: "respond-envido", playerId: playerA, response: "quiero" });

    expect(accepted.hand?.envido).toMatchObject({ status: "accepted", acceptedValue: 6 });
  });
});

describe("applyAction — envido cumulative cost and reveal (spec: truco-rules)", () => {
  it("an accepted chain's value is cumulative, and no points are awarded until reveal", () => {
    const accepted = apply(pendingEnvidoAt(["envido", "envidoEnvido", "realEnvido"]), { type: "respond-envido", playerId: playerB, response: "quiero" });
    expect(accepted.hand?.envido).toMatchObject({ status: "accepted", acceptedValue: 7 });
    expect(accepted.teams[0]!.score).toBe(0);
    expect(accepted.teams[1]!.score).toBe(0);
  });

  it("reveal awards the accepted value to the winning team (playerA's 33 beats playerB's 5)", () => {
    const accepted = apply(pendingEnvidoAt(["envido"]), { type: "respond-envido", playerId: playerB, response: "quiero" });
    const revealed = apply(accepted, { type: "reveal-envido", playerId: playerA });
    expect(revealed.teams[0]!.score).toBe(2);
    expect(revealed.teams[1]!.score).toBe(0);
    expect(revealed.hand?.envido).toMatchObject({ status: "revealed", winningTeamId: revealed.teams[0]!.id });
  });

  it.each([
    [["envido"] as const, 1, 0],
    [["envido", "envidoEnvido"] as const, 0, 2],
    [["envido", "envidoEnvido", "realEnvido"] as const, 4, 0],
    [["envido", "faltaEnvido"] as const, 0, 2], // falta's own value is never read on decline — only the calls before it count
  ])("declining after %j concedes the value of the calls before it", (levels, scoreA, scoreB) => {
    const decliner = levels.length % 2 === 1 ? playerB : playerA;
    const declined = apply(pendingEnvidoAt(levels), { type: "respond-envido", playerId: decliner, response: "no-quiero" });
    expect(declined.teams[0]!.score).toBe(scoreA);
    expect(declined.teams[1]!.score).toBe(scoreB);
  });

  it("a tied reveal is won by the mano's team", () => {
    const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 30, dealerSeat: 0 });
    const tied = startHand(state, [[{ suit: "espada", rank: 5 }], [{ suit: "oro", rank: 5 }]]); // manoSeat = 1 (playerB)
    const accepted = apply(apply(tied, { type: "call-envido", playerId: playerA, level: "envido" }), { type: "respond-envido", playerId: playerB, response: "quiero" });
    const revealed = apply(accepted, { type: "reveal-envido", playerId: playerA });
    expect(revealed.hand?.envido).toMatchObject({ winningTeamId: revealed.teams[1]!.id });
  });
});

describe("applyAction — no flor in v1, and purity (spec: truco-rules)", () => {
  it("no flor-related action is ever present in the legal action set", () => {
    const states = [
      freshHand(),
      apply(freshHand(), { type: "call-envido", playerId: playerA, level: "envido" }),
      pendingEnvidoAt(["envido", "envidoEnvido"]),
      apply(freshHand(), { type: "call-truco", playerId: playerA, level: "truco" }),
    ];
    const allActions = states.flatMap((s) => [...getLegalActions(s, playerA), ...getLegalActions(s, playerB)]);
    expect(allActions.length).toBeGreaterThan(0);
    expect(allActions.every((a) => !a.type.toLowerCase().includes("flor"))).toBe(true);
  });

  it.each([
    ["decline (which awards points)", pendingEnvidoAt(["envido"]), { type: "respond-envido", playerId: playerB, response: "no-quiero" }],
    ["reveal (which awards points)", apply(pendingEnvidoAt(["envido"]), { type: "respond-envido", playerId: playerB, response: "quiero" }), { type: "reveal-envido", playerId: playerA }],
  ] as const)("does not mutate the input state on %s", (_label, state, action) => {
    const before = JSON.stringify(state);
    applyAction(state, action);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("calculateEnvidoPoints", () => {
  it.each([
    ["two same-suit cards", [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }], 33],
    ["three same-suit cards use only the two highest", [{ suit: "oro", rank: 7 }, { suit: "oro", rank: 5 }, { suit: "oro", rank: 2 }], 32],
    ["figure cards (10/11/12) count zero toward a suit pair", [{ suit: "copa", rank: 12 }, { suit: "copa", rank: 3 }], 23],
    ["no shared suit falls back to the single highest card", [{ suit: "espada", rank: 5 }, { suit: "basto", rank: 12 }, { suit: "oro", rank: 3 }], 5],
    ["no shared suit, only figure cards, is worth zero", [{ suit: "espada", rank: 10 }, { suit: "basto", rank: 11 }], 0],
  ] as const)("%s", (_label, hand, expected) => {
    expect(calculateEnvidoPoints(hand as readonly Card[])).toBe(expected);
  });
});
