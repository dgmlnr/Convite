import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Card } from "./card.js";
import { buildDeck } from "./deck.js";
import { calculateEnvidoPoints, resolveEnvidoDeclarations } from "./envido-chain.js";
import type { PlayerId } from "./ids.js";
import { createHeadToHeadMatch, createTeamMatch, startHand } from "./match.js";
import type { EnvidoCallLevel, EnvidoState, MatchState } from "./match.js";
import { applyAction, getLegalActions } from "./truco-chain.js";
import type { Action } from "./truco-chain.js";

const playerA = "player-a" as PlayerId;
const playerB = "player-b" as PlayerId;
const playerC = "player-c" as PlayerId;
const playerD = "player-d" as PlayerId;

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
  it("either player may open truco or envido when nothing is pending", () => {
    expect(getLegalActions(freshHand(), playerA)).toEqual([
      { type: "call-truco", playerId: playerA, level: "truco" },
      { type: "call-envido", playerId: playerA, level: "envido" },
    ]);
  });

  it("envido may still open even after truco has been called — it interrupts a pending truco call (real rule; replaces the earlier truco.status==='none' placeholder)", () => {
    const called = apply(freshHand(), { type: "call-truco", playerId: playerA, level: "truco" });
    expect(getLegalActions(called, playerB)).toContainEqual({ type: "call-envido", playerId: playerB, level: "envido" });
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

describe("getLegalActions — envido opening gate: only during the first trick, before your own card lands", () => {
  // dealerSeat: 1 makes playerA (seat 0) mano — matches card-play.test.ts's convention.
  function firstTrickHand(handA: readonly Card[], handB: readonly Card[]): MatchState {
    const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 30, dealerSeat: 1 });
    return startHand(state, [handA, handB]);
  }

  const cardA1: Card = { suit: "espada", rank: 1 };
  const cardA2: Card = { suit: "basto", rank: 7 };
  const cardB1: Card = { suit: "espada", rank: 4 };
  const cardB2: Card = { suit: "oro", rank: 4 };

  it("mano may open envido before playing their first card", () => {
    const state = firstTrickHand([cardA1], [cardB1]);
    expect(getLegalActions(state, playerA)).toContainEqual({ type: "call-envido", playerId: playerA, level: "envido" });
  });

  it("pie may open envido after mano has played, but before playing their own card", () => {
    const state = firstTrickHand([cardA1], [cardB1]);
    const afterManoPlays = apply(state, { type: "play-card", playerId: playerA, card: cardA1 });
    expect(getLegalActions(afterManoPlays, playerB)).toContainEqual({ type: "call-envido", playerId: playerB, level: "envido" });
  });

  it("nobody can open once both first-trick cards are on the table", () => {
    const state = firstTrickHand([cardA1], [cardB1]);
    const afterTrick1 = apply(
      apply(state, { type: "play-card", playerId: playerA, card: cardA1 }),
      { type: "play-card", playerId: playerB, card: cardB1 },
    );
    expect(getLegalActions(afterTrick1, playerA).some((a) => a.type === "call-envido")).toBe(false);
    expect(getLegalActions(afterTrick1, playerB).some((a) => a.type === "call-envido")).toBe(false);
  });

  it("envido is never callable once the first trick has resolved (covers trick 2 and 3)", () => {
    const state = firstTrickHand([cardA1, cardA2], [cardB1, cardB2]);
    const afterTrick1 = apply(
      apply(state, { type: "play-card", playerId: playerA, card: cardA1 }),
      { type: "play-card", playerId: playerB, card: cardB1 },
    );
    expect(getLegalActions(afterTrick1, playerA).some((a) => a.type === "call-envido")).toBe(false);
    const midTrick2 = apply(afterTrick1, { type: "play-card", playerId: playerA, card: cardA2 });
    expect(getLegalActions(midTrick2, playerB).some((a) => a.type === "call-envido")).toBe(false);
  });

  it("a player who already played their card can still escalate an envido opened by the opponent, just not open one", () => {
    const state = firstTrickHand([cardA1], [cardB1]);
    const afterManoPlays = apply(state, { type: "play-card", playerId: playerA, card: cardA1 });
    const opened = apply(afterManoPlays, { type: "call-envido", playerId: playerB, level: "envido" });

    expect(getLegalActions(opened, playerA)).toContainEqual({ type: "respond-envido", playerId: playerA, response: "quiero" });
    expect(getLegalActions(opened, playerA)).toContainEqual({ type: "call-envido", playerId: playerA, level: "realEnvido" });
  });

  it("a truco decline still blocks envido opening even though the first trick never happened (regression: hand already over)", () => {
    const state = firstTrickHand([cardA1], [cardB1]);
    const declined = apply(
      apply(state, { type: "call-truco", playerId: playerA, level: "truco" }),
      { type: "respond-truco", playerId: playerB, response: "no-quiero" },
    );
    expect(getLegalActions(declined, playerA).some((a) => a.type === "call-envido")).toBe(false);
    expect(getLegalActions(declined, playerB).some((a) => a.type === "call-envido")).toBe(false);
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

    // Rider (PR-1 review): the respond-envido "no-quiero" CallEvent was only
    // count-covered before this — assert its exact shape directly, not just
    // that SOME event got appended.
    const decliningPlayer = declined.players.find((player) => player.id === decliner)!;
    expect(declined.hand?.callEvents).toContainEqual({
      kind: "envido-response",
      playerId: decliner,
      teamId: decliningPlayer.teamId,
      seat: decliningPlayer.seat,
      response: "no-quiero",
    });
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

/**
 * 2v2 envido (design/spec: "each player has their own envido value; the
 * team's is the best among its members"). Team A = seats 0/2 (playerA,
 * playerC); team B = seats 1/3 (playerB, playerD).
 */
describe("applyAction — 2v2 envido: team value is the BEST among its members, not just the caller's own hand", () => {
  it("awards the reveal to the team whose STRONGER hand belongs to the non-calling teammate", () => {
    const state = createTeamMatch({ seatOrder: [playerA, playerB, playerC, playerD], pointsToWin: 30, dealerSeat: 3 });
    const dealt = startHand(state, [
      [{ suit: "oro", rank: 4 }, { suit: "basto", rank: 4 }, { suit: "copa", rank: 4 }], // playerA (team A): weak, envido 4
      [{ suit: "basto", rank: 5 }, { suit: "copa", rank: 10 }, { suit: "oro", rank: 2 }], // playerB (team B): weak, envido 5
      [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }, { suit: "oro", rank: 3 }], // playerC (team A): strong, envido 33
      [{ suit: "basto", rank: 3 }, { suit: "basto", rank: 4 }, { suit: "oro", rank: 1 }], // playerD (team B): moderate, envido 27
    ]);

    // playerA (the WEAKER member of team A) opens and calls envido — the team's
    // value must still be team A's BEST (playerC's 33), not the caller's own 4.
    const pending = apply(dealt, { type: "call-envido", playerId: playerA, level: "envido" });
    const accepted = apply(pending, { type: "respond-envido", playerId: playerB, response: "quiero" });
    const revealed = apply(accepted, { type: "reveal-envido", playerId: playerA });

    const teamA = revealed.teams.find((t) => t.playerIds.includes(playerA))!;
    const teamB = revealed.teams.find((t) => t.playerIds.includes(playerB))!;
    expect(revealed.hand?.envido).toMatchObject({ status: "revealed", winningTeamId: teamA.id });
    expect(teamA.score).toBe(2); // accepted chain value (single "envido" call)
    expect(teamB.score).toBe(0);
  });

  it("the losing team's better hand (27) still loses to the winning team's better hand (33) — proves BOTH sides use their best, not just the caller/responder", () => {
    const state = createTeamMatch({ seatOrder: [playerA, playerB, playerC, playerD], pointsToWin: 30, dealerSeat: 3 });
    const dealt = startHand(state, [
      [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }, { suit: "oro", rank: 3 }], // playerA (team A): strong, envido 33
      [{ suit: "basto", rank: 3 }, { suit: "basto", rank: 4 }, { suit: "oro", rank: 1 }], // playerB (team B): moderate, envido 27
      [{ suit: "oro", rank: 4 }, { suit: "basto", rank: 5 }, { suit: "copa", rank: 4 }], // playerC (team A): weak
      [{ suit: "basto", rank: 5 }, { suit: "copa", rank: 10 }, { suit: "oro", rank: 2 }], // playerD (team B): weak
    ]);

    const accepted = apply(
      apply(dealt, { type: "call-envido", playerId: playerA, level: "envido" }),
      { type: "respond-envido", playerId: playerD, response: "quiero" },
    );
    const revealed = apply(accepted, { type: "reveal-envido", playerId: playerA });

    const teamA = revealed.teams.find((t) => t.playerIds.includes(playerA))!;
    expect(revealed.hand?.envido).toMatchObject({ winningTeamId: teamA.id });
  });
});

/**
 * Ordered public call log (spec: "Ordered Call Log"). Every truco call,
 * envido call, response, and reveal is appended, in the order applied,
 * attributed to its actor. The chain below deliberately interleaves both
 * reducers — envido must resolve before truco is legal at all
 * (`getLegalTrucoActions`), so the only way to exercise "truco after
 * envido" for real is to actually resolve envido first, same as a real
 * table.
 */
describe("callEvents — ordered public call log across truco+envido chains (spec: 'Ordered Call Log')", () => {
  it("records every call/response/reveal in the exact order applied, each attributed to its actor", () => {
    const state = freshHand();
    const teamAId = state.teams[0]!.id;
    const teamBId = state.teams[1]!.id;

    let s = apply(state, { type: "call-envido", playerId: playerA, level: "envido" });
    s = apply(s, { type: "call-envido", playerId: playerB, level: "realEnvido" });
    s = apply(s, { type: "respond-envido", playerId: playerA, response: "quiero" });
    s = apply(s, { type: "reveal-envido", playerId: playerB });
    s = apply(s, { type: "call-truco", playerId: playerA, level: "truco" });
    s = apply(s, { type: "respond-truco", playerId: playerB, response: "quiero" });
    s = apply(s, { type: "call-truco", playerId: playerB, level: "retruco" });
    s = apply(s, { type: "respond-truco", playerId: playerA, response: "no-quiero" });

    expect(s.hand?.callEvents).toEqual([
      { kind: "envido-call", playerId: playerA, teamId: teamAId, seat: 0, level: "envido" },
      { kind: "envido-call", playerId: playerB, teamId: teamBId, seat: 1, level: "realEnvido" },
      { kind: "envido-response", playerId: playerA, teamId: teamAId, seat: 0, response: "quiero" },
      { kind: "envido-reveal", playerId: playerB, teamId: teamBId, seat: 1 },
      { kind: "truco-call", playerId: playerA, teamId: teamAId, seat: 0, level: "truco" },
      { kind: "truco-response", playerId: playerB, teamId: teamBId, seat: 1, response: "quiero" },
      { kind: "truco-call", playerId: playerB, teamId: teamBId, seat: 1, level: "retruco" },
      { kind: "truco-response", playerId: playerA, teamId: teamAId, seat: 0, response: "no-quiero" },
    ]);
  });

  it("a re-deal clears the call log to empty (spec: 'New deal')", () => {
    const called = apply(freshHand(), { type: "call-envido", playerId: playerA, level: "envido" });
    expect(called.hand?.callEvents.length).toBeGreaterThan(0);

    const nextHand = startHand(called, [[], []]);
    expect(nextHand.hand?.callEvents).toEqual([]);
  });
});

/**
 * Per-player envido declaration order (spec: "Per-Player Envido Declaration
 * Order"; AMENDMENT — supersedes design D-3's lexicographic
 * `(points, isManoTeam)` comparator: declare iff `points > runningBest`,
 * plain strictly-greater, no mano-priority term). `resolveEnvidoDeclarations`
 * is pure over `state.players`' own hands and `manoSeat` — it does not read
 * `hand.envido` at all, so these tests call it directly rather than driving
 * a call/quiero/reveal chain first (T-4/T-5 exercise the wired-through
 * version once `reveal-envido` computes it, see envido-chain.test.ts's own
 * derivation-equivalence property and view.test.ts's redaction property).
 */
describe("resolveEnvidoDeclarations — per-player declaration order (T-3, amended comparator)", () => {
  it("mano has the best hand: only mano's entry carries points, every other entry is son buenas", () => {
    const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 30, dealerSeat: 1 }); // manoSeat = 0 -> playerA
    const dealt = startHand(state, [
      [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 6 }, { suit: "oro", rank: 3 }], // playerA: 33
      [{ suit: "basto", rank: 5 }, { suit: "copa", rank: 10 }, { suit: "oro", rank: 2 }], // playerB: 5
    ]);
    const manoSeat = dealt.hand!.manoSeat;
    expect(manoSeat).toBe(0);

    const declarations = resolveEnvidoDeclarations(dealt, manoSeat);

    const teamAId = dealt.teams[0]!.id;
    const teamBId = dealt.teams[1]!.id;
    expect(declarations).toEqual([
      { declaration: "points", playerId: playerA, teamId: teamAId, seat: 0, points: 33 },
      { declaration: "sonBuenas", playerId: playerB, teamId: teamBId, seat: 1 },
    ]);
  });

  it("a later player beats the running best -> only later players who then exceed IT (not the original best) also declare", () => {
    const state = createTeamMatch({ seatOrder: [playerA, playerB, playerC, playerD], pointsToWin: 30, dealerSeat: 3 }); // manoSeat = 0 -> playerA
    const dealt = startHand(state, [
      [{ suit: "espada", rank: 5 }, { suit: "basto", rank: 2 }, { suit: "copa", rank: 1 }], // playerA (mano, team A): 5 (no shared suit)
      [{ suit: "basto", rank: 3 }, { suit: "basto", rank: 4 }, { suit: "oro", rank: 1 }], // playerB (team B): 27 -- beats 5, declares
      [{ suit: "espada", rank: 1 }, { suit: "espada", rank: 3 }, { suit: "oro", rank: 7 }], // playerC (team A): 24 -- does NOT beat 27, withholds, even though 24 > 5
      [{ suit: "copa", rank: 7 }, { suit: "copa", rank: 3 }, { suit: "basto", rank: 1 }], // playerD (team B): 30 -- beats 27, declares
    ]);
    const manoSeat = dealt.hand!.manoSeat;
    expect(manoSeat).toBe(0);

    const declarations = resolveEnvidoDeclarations(dealt, manoSeat);

    const teamAId = dealt.teams[0]!.id;
    const teamBId = dealt.teams[1]!.id;
    expect(declarations).toEqual([
      { declaration: "points", playerId: playerA, teamId: teamAId, seat: 0, points: 5 },
      { declaration: "points", playerId: playerB, teamId: teamBId, seat: 1, points: 27 },
      { declaration: "sonBuenas", playerId: playerC, teamId: teamAId, seat: 2 },
      { declaration: "points", playerId: playerD, teamId: teamBId, seat: 3, points: 30 },
    ]);
  });

  it("AMENDED 2v2 fixture (tasks.md amendment bullet 4): mano 27, a cross-team 31 declares, a same-value 31 later withholds -- the derived winner (last 'points' entry) is team B, not mano's team A", () => {
    const state = createTeamMatch({ seatOrder: [playerA, playerB, playerC, playerD], pointsToWin: 30, dealerSeat: 3 }); // manoSeat = 0 -> playerA
    const dealt = startHand(state, [
      [{ suit: "basto", rank: 3 }, { suit: "basto", rank: 4 }, { suit: "oro", rank: 1 }], // playerA (mano, team A): 27
      [{ suit: "espada", rank: 7 }, { suit: "espada", rank: 4 }, { suit: "oro", rank: 2 }], // playerB (team B): 31 -- beats 27, declares
      [{ suit: "copa", rank: 7 }, { suit: "copa", rank: 4 }, { suit: "basto", rank: 1 }], // playerC (team A): 31 -- ties, does NOT beat 31, withholds
      [{ suit: "oro", rank: 3 }, { suit: "basto", rank: 5 }, { suit: "copa", rank: 1 }], // playerD (team B): 5 -- lower, withholds
    ]);
    const manoSeat = dealt.hand!.manoSeat;
    expect(manoSeat).toBe(0);

    const declarations = resolveEnvidoDeclarations(dealt, manoSeat);

    const teamAId = dealt.teams[0]!.id;
    const teamBId = dealt.teams[1]!.id;
    expect(declarations).toEqual([
      { declaration: "points", playerId: playerA, teamId: teamAId, seat: 0, points: 27 },
      { declaration: "points", playerId: playerB, teamId: teamBId, seat: 1, points: 31 },
      { declaration: "sonBuenas", playerId: playerC, teamId: teamAId, seat: 2 },
      { declaration: "sonBuenas", playerId: playerD, teamId: teamBId, seat: 3 },
    ]);
    // Structural redaction (D-1): a son-buenas entry has NO `points` key at
    // all -- not "points: undefined", the key itself is absent.
    expect(declarations.filter((entry) => entry.declaration === "sonBuenas").every((entry) => !("points" in entry))).toBe(true);
    // D-2: the derived winner is the team of the LAST "points" entry -- team
    // B, the amended behavior (was team A under the now-replaced isManoTeam
    // tie component; see the AMENDMENT docblock on resolveEnvidoDeclarations).
    const lastPointsEntry = [...declarations].reverse().find((entry) => entry.declaration === "points")!;
    expect(lastPointsEntry.teamId).toBe(teamBId);
  });
});

/**
 * Derivation equivalence (design D-2, T-4): `resolveEnvidoWinner`'s
 * replacement must agree with `resolveEnvidoDeclarations`'s own output by
 * CONSTRUCTION, not by coincidence. A purely random legal walk rarely
 * reaches `revealed` (call/respond/reveal envido is one action among many
 * competing with card-play/truco/señas), so these generators DRIVE the
 * envido chain straight to reveal -- mano opens, the first legal opponent
 * accepts, mano reveals -- while still randomizing the deal and (via
 * `dealerSeat`) which seat is mano, for both 1v1 and 2v2.
 */
const revealedHeadToHeadArb = fc
  .tuple(fc.shuffledSubarray(buildDeck() as Card[], { minLength: 6, maxLength: 6 }), fc.constantFrom(0, 1))
  .map(([cards, dealerSeat]) => {
    const base = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 30, dealerSeat });
    const dealt = startHand(base, [cards.slice(0, 3), cards.slice(3, 6)]);
    const manoSeat = dealt.hand!.manoSeat;
    const mano = dealt.players.find((player) => player.seat === manoSeat)!;
    const opponent = dealt.players.find((player) => player.seat !== manoSeat)!;
    const called = apply(dealt, { type: "call-envido", playerId: mano.id, level: "envido" });
    const accepted = apply(called, { type: "respond-envido", playerId: opponent.id, response: "quiero" });
    return apply(accepted, { type: "reveal-envido", playerId: mano.id });
  });

const revealedTeamArb = fc
  .tuple(fc.shuffledSubarray(buildDeck() as Card[], { minLength: 12, maxLength: 12 }), fc.constantFrom(0, 1, 2, 3))
  .map(([cards, dealerSeat]) => {
    const base = createTeamMatch({ seatOrder: [playerA, playerB, playerC, playerD], pointsToWin: 30, dealerSeat });
    const dealt = startHand(base, [cards.slice(0, 3), cards.slice(3, 6), cards.slice(6, 9), cards.slice(9, 12)]);
    const manoSeat = dealt.hand!.manoSeat;
    const mano = dealt.players.find((player) => player.seat === manoSeat)!;
    const opponent = dealt.players.find((player) => player.teamId !== mano.teamId)!;
    const called = apply(dealt, { type: "call-envido", playerId: mano.id, level: "envido" });
    const accepted = apply(called, { type: "respond-envido", playerId: opponent.id, response: "quiero" });
    return apply(accepted, { type: "reveal-envido", playerId: mano.id });
  });

describe("envido.declarations — derivation equivalence property (design D-2, T-4)", () => {
  it("in every revealed state (1v1 and 2v2), the teamId of the LAST 'points' declaration equals envido.winningTeamId", () => {
    fc.assert(
      fc.property(fc.oneof(revealedHeadToHeadArb, revealedTeamArb), (state) => {
        const revealed = state.hand!.envido as Extract<EnvidoState, { status: "revealed" }>;
        const lastPointsEntry = [...revealed.declarations].reverse().find((entry) => entry.declaration === "points")!;
        return lastPointsEntry.teamId === revealed.winningTeamId;
      }),
    );
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
