import { describe, expect, it } from "vitest";
import type { Card } from "./card.js";
import type { PlayerId } from "./ids.js";
import { createHeadToHeadMatch, createTeamMatch, getMatchWinner, rotateDealer, startHand } from "./match.js";
import type { MatchState } from "./match.js";
import { applyAction, getLegalActions } from "./truco-chain.js";
import type { Action } from "./truco-chain.js";

const playerA = "player-a" as PlayerId;
const playerB = "player-b" as PlayerId;
const playerC = "player-c" as PlayerId;
const playerD = "player-d" as PlayerId;

/** dealerSeat: 1 makes playerA (seat 0) mano, so playerA leads trick 1 —
 * matches the deterministic 3-trick scenario used across this file. */
function freshHand(handA: readonly Card[], handB: readonly Card[]): MatchState {
  const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15, dealerSeat: 1 });
  return startHand(state, [handA, handB]);
}

function apply(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`expected legal action, got violation: ${result.violation}`);
  return result.state;
}

describe("getLegalActions/applyAction — play-card turn validation", () => {
  it("only the seat holding turnSeat may play; the other seat's play-card is illegal, not silently ignored", () => {
    const state = freshHand([{ suit: "espada", rank: 1 }], [{ suit: "espada", rank: 4 }]); // mano = playerA

    expect(getLegalActions(state, playerB).some((a) => a.type === "play-card")).toBe(false);
    expect(getLegalActions(state, playerA)).toContainEqual({
      type: "play-card",
      playerId: playerA,
      card: { suit: "espada", rank: 1 },
    });

    const result = applyAction(state, { type: "play-card", playerId: playerB, card: { suit: "espada", rank: 4 } });
    expect(result.ok).toBe(false);
  });

  it("rejects playing a card not held by the player", () => {
    const state = freshHand([{ suit: "espada", rank: 1 }], []);

    const result = applyAction(state, { type: "play-card", playerId: playerA, card: { suit: "oro", rank: 7 } });
    expect(result.ok).toBe(false);
  });

  it("rejects replaying an already-spent card", () => {
    const state = freshHand(
      [{ suit: "espada", rank: 1 }, { suit: "basto", rank: 4 }],
      [{ suit: "espada", rank: 4 }, { suit: "basto", rank: 1 }],
    );
    const afterTrick1 = apply(
      apply(state, { type: "play-card", playerId: playerA, card: { suit: "espada", rank: 1 } }),
      { type: "play-card", playerId: playerB, card: { suit: "espada", rank: 4 } },
    );
    // playerA won trick 1 (1-espada beats 4-espada) and leads trick 2; retrying the spent card is illegal.
    const result = applyAction(afterTrick1, { type: "play-card", playerId: playerA, card: { suit: "espada", rank: 1 } });
    expect(result.ok).toBe(false);
  });

  it.each([
    ["truco call pending a response", { type: "call-truco", playerId: "self" as unknown as PlayerId, level: "truco" as const }],
    ["envido call pending a response", { type: "call-envido", playerId: "self" as unknown as PlayerId, level: "envido" as const }],
  ])("blocks card play while a %s (must resolve before play continues)", (_label, callTemplate) => {
    const state = freshHand([{ suit: "espada", rank: 1 }], [{ suit: "espada", rank: 4 }]);
    const called = apply(state, { ...callTemplate, playerId: playerA } as Action);

    expect(getLegalActions(called, playerA).some((a) => a.type === "play-card")).toBe(false);
    expect(getLegalActions(called, playerB).some((a) => a.type === "play-card")).toBe(false);
  });

  /** Real Truco Argentino rule: envido tantos are counted and awarded
   * IMMEDIATELY after a "quiero", before card play resumes — reveal is not
   * optional bookkeeping deferred to hand-end. If card play stayed legal
   * while envido sits "accepted" (quiero'd but not yet revealed), a hand that
   * gets decided by cards before anyone reveals would permanently lose the
   * envido points: `getLegalEnvidoActions` stops offering `reveal-envido`
   * the instant `hand.outcome.decided` flips (card-play.ts's own decided
   * gate), so a deferred reveal becomes unreachable once the hand ends.
   * `callsAreSettled` (card-play.ts) already gates on `envido.status ===
   * "accepted"` alongside "pending" — this proves that gate holds for the
   * ACCEPTED (not just pending) case specifically, closing the gap a partial
   * read of `getLegalCardPlayActions`'s first guard clause (only
   * `hand.outcome.decided` / `hand.truco.status === "declined"`) could miss. */
  it("blocks card play while envido is accepted but not yet revealed (tantos must be counted before play resumes)", () => {
    const state = freshHand([{ suit: "espada", rank: 1 }], [{ suit: "espada", rank: 4 }]);
    const accepted = apply(
      apply(state, { type: "call-envido", playerId: playerA, level: "envido" }),
      { type: "respond-envido", playerId: playerB, response: "quiero" },
    );

    expect(accepted.hand?.envido.status).toBe("accepted");
    expect(getLegalActions(accepted, playerA).some((a) => a.type === "play-card")).toBe(false);

    // And still blocked HALFWAY THROUGH the round, which is the part the
    // all-at-once reveal could not express: one player has said their tantos
    // and the other has not, so the envido is neither settled nor gone.
    const halfway = apply(accepted, { type: "declare-envido", playerId: playerA, declaration: "points" });
    expect(halfway.hand?.envido.status, "one declaration does not end a round").toBe("accepted");
    expect(getLegalActions(halfway, playerB).some((a) => a.type === "play-card")).toBe(false);
    expect(getLegalActions(accepted, playerB).some((a) => a.type === "play-card")).toBe(false);
    // The only thing legal is declaring — never a raw play-card. TWO options
    // now, because saying your tantos and conceding are both real choices.
    expect(getLegalActions(accepted, playerA)).toEqual([
      { type: "declare-envido", playerId: playerA, declaration: "points" },
      { type: "declare-envido", playerId: playerA, declaration: "sonBuenas" },
    ]);

    const result = applyAction(accepted, { type: "play-card", playerId: playerA, card: { suit: "espada", rank: 1 } });
    expect(result.ok).toBe(false);
  });
});

describe("applyAction — trick advancement wired through resolveTrick", () => {
  it.each([
    ["a decided trick: the winner leads next", { suit: "espada", rank: 1 } as const, { suit: "espada", rank: 4 } as const],
    ["a parda (tie): the SAME leader leads again (INFERENCE — spec is silent on post-trick turn order)", { suit: "espada", rank: 12 } as const, { suit: "oro", rank: 12 } as const],
  ])("%s", (_label, cardA, cardB) => {
    const state = freshHand([cardA, { suit: "espada", rank: 7 }], [cardB, { suit: "basto", rank: 4 }]);
    const after = apply(apply(state, { type: "play-card", playerId: playerA, card: cardA }), { type: "play-card", playerId: playerB, card: cardB });

    // playerA (seat 0) leads trick 2 either way: it wins outright, or it tied and leads again.
    expect(getLegalActions(after, playerA).some((a) => a.type === "play-card")).toBe(true);
    expect(getLegalActions(after, playerB).some((a) => a.type === "play-card")).toBe(false);
  });
});

describe("applyAction — a complete three-trick hand, end to end (the reason this work unit exists)", () => {
  it("plays three tricks in turn, resolves each via resolveTrick, decides the hand via resolveHandWinner on a split, and awards the base hand point to the winning team", () => {
    const handA: readonly Card[] = [
      { suit: "espada", rank: 1 }, // trick 1: strongest card, wins
      { suit: "basto", rank: 4 }, // trick 2: weakest group, loses
      { suit: "espada", rank: 7 }, // trick 3: strong, wins the decider
    ];
    const handB: readonly Card[] = [
      { suit: "espada", rank: 4 }, // trick 1: weakest group, loses
      { suit: "basto", rank: 1 }, // trick 2: 2nd strongest, wins
      { suit: "oro", rank: 4 }, // trick 3: weakest group, loses the decider
    ];
    const state = freshHand(handA, handB);

    // Trick 1: playerA (mano) leads and wins with 1-espada over 4-espada.
    let s = apply(state, { type: "play-card", playerId: playerA, card: handA[0]! });
    s = apply(s, { type: "play-card", playerId: playerB, card: handB[0]! });
    expect(s.hand?.trickOutcomes).toHaveLength(1);
    expect(s.hand?.outcome).toEqual({ decided: false });

    // Trick 2: playerA (trick 1 winner) leads, playerB wins with 1-basto over 4-basto.
    s = apply(s, { type: "play-card", playerId: playerA, card: handA[1]! });
    s = apply(s, { type: "play-card", playerId: playerB, card: handB[1]! });
    expect(s.hand?.trickOutcomes).toHaveLength(2);
    expect(s.hand?.outcome).toEqual({ decided: false }); // tricks 1 and 2 split — trick 3 must decide

    // Trick 3: playerB (trick 2 winner) leads, playerA wins with 7-espada over 4-oro, deciding the hand.
    s = apply(s, { type: "play-card", playerId: playerB, card: handB[2]! });
    s = apply(s, { type: "play-card", playerId: playerA, card: handA[2]! });

    expect(s.hand?.trickOutcomes).toHaveLength(3);
    expect(s.hand?.outcome).toEqual({ decided: true, winnerTeamId: s.teams[0]!.id });
    expect(s.teams[0]!.score).toBe(1); // base hand value — truco was never called
    expect(s.teams[1]!.score).toBe(0);
    expect(getLegalActions(s, playerA)).toEqual([]);
    expect(getLegalActions(s, playerB)).toEqual([]);

    // Every resolved trick's plays are RETAINED (spec: "Retain All-Trick
    // Plays"), index-aligned with trickOutcomes, oldest first — not just the
    // in-progress trick, which currentTrickPlays already covered and keeps
    // covering unchanged.
    expect(s.hand?.resolvedTrickPlays).toHaveLength(3);
    expect(s.hand?.resolvedTrickPlays?.length).toBe(s.hand?.trickOutcomes.length);
    expect(s.hand?.resolvedTrickPlays?.[0]).toEqual([
      { playerId: playerA, teamId: s.teams[0]!.id, seat: 0, card: handA[0] },
      { playerId: playerB, teamId: s.teams[1]!.id, seat: 1, card: handB[0] },
    ]);
    expect(s.hand?.resolvedTrickPlays?.[2]).toEqual([
      { playerId: playerB, teamId: s.teams[1]!.id, seat: 1, card: handB[2] },
      { playerId: playerA, teamId: s.teams[0]!.id, seat: 0, card: handA[2] },
    ]);

    // A non-terminal hand starts a fresh, mano-rotated hand — same pattern the
    // truco-decline path already uses (match.test.ts): the engine does not
    // auto-advance; the caller rotates and deals explicitly.
    expect(getMatchWinner(s)).toBeNull();
    const nextHand = startHand(rotateDealer(s), [[], []]);
    expect(nextHand.hand?.manoSeat).not.toBe(s.hand?.manoSeat);
    expect(nextHand.hand?.resolvedTrickPlays).toEqual([]); // reset on deal (spec: "New deal")
  });

  it("a hand decided by the second trick (two straight wins) needs no third trick", () => {
    const handA: readonly Card[] = [{ suit: "espada", rank: 1 }, { suit: "espada", rank: 7 }];
    const handB: readonly Card[] = [{ suit: "espada", rank: 4 }, { suit: "basto", rank: 4 }];
    const state = freshHand(handA, handB);

    let s = apply(state, { type: "play-card", playerId: playerA, card: handA[0]! });
    s = apply(s, { type: "play-card", playerId: playerB, card: handB[0]! });
    s = apply(s, { type: "play-card", playerId: playerA, card: handA[1]! });
    s = apply(s, { type: "play-card", playerId: playerB, card: handB[1]! });

    expect(s.hand?.trickOutcomes).toHaveLength(2);
    expect(s.hand?.outcome).toEqual({ decided: true, winnerTeamId: s.teams[0]!.id });
  });

  it("awards the accepted truco level's value, not the base 1 point, when the hand is decided by cards after an accepted call", () => {
    const handA: readonly Card[] = [{ suit: "espada", rank: 1 }, { suit: "espada", rank: 7 }];
    const handB: readonly Card[] = [{ suit: "espada", rank: 4 }, { suit: "basto", rank: 4 }];
    const state = freshHand(handA, handB);
    const accepted = apply(
      apply(state, { type: "call-truco", playerId: playerA, level: "truco" }),
      { type: "respond-truco", playerId: playerB, response: "quiero" },
    );

    let s = apply(accepted, { type: "play-card", playerId: playerA, card: handA[0]! });
    s = apply(s, { type: "play-card", playerId: playerB, card: handB[0]! });
    s = apply(s, { type: "play-card", playerId: playerA, card: handA[1]! });
    s = apply(s, { type: "play-card", playerId: playerB, card: handB[1]! });

    expect(s.teams[0]!.score).toBe(2); // accepted truco value — standard Truco Argentino scoring (INFERENCE, spec states no numbers; matches PR4's existing DECLINE_VALUE convention)
  });

  it("does not mutate the input state", () => {
    const state = freshHand([{ suit: "espada", rank: 1 }], [{ suit: "espada", rank: 4 }]);
    const before = JSON.stringify(state);

    applyAction(state, { type: "play-card", playerId: playerA, card: { suit: "espada", rank: 1 } });

    expect(JSON.stringify(state)).toBe(before);
  });
});

/**
 * 2v2 card play. Seat order 0,1,2,3 with A/C on one team and B/D on the
 * other (createTeamMatch). Turn order goes AROUND THE TABLE (spec: "Turn
 * order goes around the table"), so a trick only resolves once all FOUR
 * plays are in — this is the generalization card-play.ts needed beyond the
 * existing 1v1 "resolve after 2 plays" rule.
 */
function freshTeamHand(handA: readonly Card[], handB: readonly Card[], handC: readonly Card[], handD: readonly Card[]): MatchState {
  // dealerSeat: 3 makes seat 0 (playerA) mano, so playerA leads trick 1.
  const state = createTeamMatch({ seatOrder: [playerA, playerB, playerC, playerD], pointsToWin: 15, dealerSeat: 3 });
  return startHand(state, [handA, handB, handC, handD]);
}

describe("applyAction — 2v2 trick advancement (four plays per trick, turn order around the table)", () => {
  it("advances turnSeat around the table 0 -> 1 -> 2 -> 3 for the first three plays of a trick", () => {
    const state = freshTeamHand(
      [{ suit: "espada", rank: 4 }],
      [{ suit: "basto", rank: 4 }],
      [{ suit: "oro", rank: 4 }],
      [{ suit: "copa", rank: 4 }],
    );
    expect(state.hand?.turnSeat).toBe(0);

    let s = apply(state, { type: "play-card", playerId: playerA, card: { suit: "espada", rank: 4 } });
    expect(s.hand?.turnSeat).toBe(1);
    expect(s.hand?.trickOutcomes).toHaveLength(0); // trick not resolved after 1 of 4 plays

    s = apply(s, { type: "play-card", playerId: playerB, card: { suit: "basto", rank: 4 } });
    expect(s.hand?.turnSeat).toBe(2);
    expect(s.hand?.trickOutcomes).toHaveLength(0); // NOT resolved after 2 plays, unlike 1v1 — this is the real behavior change

    s = apply(s, { type: "play-card", playerId: playerC, card: { suit: "oro", rank: 4 } });
    expect(s.hand?.turnSeat).toBe(3);
    expect(s.hand?.trickOutcomes).toHaveLength(0);
  });

  it("resolves the trick only once the fourth play lands, crediting the team of the actual winning card", () => {
    const state = freshTeamHand(
      [{ suit: "espada", rank: 4 }], // playerA (team A) — weak
      [{ suit: "basto", rank: 4 }], // playerB (team B) — weak
      [{ suit: "oro", rank: 1 }], // playerC (team A) — as de oro isn't real, use strong 7-espada instead below
      [{ suit: "copa", rank: 4 }], // playerD (team B) — weak
    );
    // Replace playerC's card with a genuinely top card to make team A's win unambiguous.
    const strongState: MatchState = { ...state, players: state.players.map((p) => (p.id === playerC ? { ...p, hand: [{ suit: "espada", rank: 1 }] } : p)) };

    let s = apply(strongState, { type: "play-card", playerId: playerA, card: { suit: "espada", rank: 4 } });
    s = apply(s, { type: "play-card", playerId: playerB, card: { suit: "basto", rank: 4 } });
    s = apply(s, { type: "play-card", playerId: playerC, card: { suit: "espada", rank: 1 } });
    expect(s.hand?.trickOutcomes).toHaveLength(0); // still not resolved — only 3 of 4 plays in
    s = apply(s, { type: "play-card", playerId: playerD, card: { suit: "copa", rank: 4 } });

    expect(s.hand?.trickOutcomes).toHaveLength(1);
    expect(s.hand?.trickOutcomes[0]!.winnerTeamId).toBe(s.teams.find((t) => t.playerIds.includes(playerA))!.id);
    // The SPECIFIC player who played the winning card (playerC, holding the as de espada) leads next —
    // not just "any member of the winning team" (playerA would be the wrong, easier-to-get-wrong answer).
    expect(s.hand?.turnSeat).toBe(2);
  });

  it("a parda (all four cards tie in team-best power) leaves the SAME leader to lead again", () => {
    const state = freshTeamHand(
      [{ suit: "espada", rank: 10 }], // playerA (team A) — best on team A
      [{ suit: "basto", rank: 5 }], // playerB (team B) — weak
      [{ suit: "oro", rank: 4 }], // playerC (team A) — weak
      [{ suit: "oro", rank: 10 }], // playerD (team B) — ties playerA's power exactly
    );

    let s = apply(state, { type: "play-card", playerId: playerA, card: { suit: "espada", rank: 10 } });
    s = apply(s, { type: "play-card", playerId: playerB, card: { suit: "basto", rank: 5 } });
    s = apply(s, { type: "play-card", playerId: playerC, card: { suit: "oro", rank: 4 } });
    s = apply(s, { type: "play-card", playerId: playerD, card: { suit: "oro", rank: 10 } });

    expect(s.hand?.trickOutcomes).toHaveLength(1);
    expect(s.hand?.trickOutcomes[0]!.winnerTeamId).toBeNull();
    expect(s.hand?.turnSeat).toBe(0); // playerA (the original leader) leads again, same as the 1v1 parda rule
  });

  it("a complete 2v2 hand: tricks 1 and 2 split between the two teams, trick 3 decides (same parda rule as 1v1, run end to end through 4 players)", () => {
    // Mirrors the 1v1 "split tricks" end-to-end test above — this is the
    // exact case obs 2918/hand-winner.ts warns was gotten wrong once
    // ("the team that won the first non-tied trick" is NOT the rule; a
    // split forces trick 3 to decide). `resolveHandWinner` itself needed no
    // change (already team-scoped), but this proves the FULL 2v2 pipeline
    // (turn order around 4 seats, trick resolution via team-best-power,
    // leader advancement) wires into it correctly.
    const handA: readonly Card[] = [{ suit: "espada", rank: 1 }, { suit: "basto", rank: 4 }, { suit: "espada", rank: 3 }]; // wins trick1, weak trick2, wins trick3
    const handB: readonly Card[] = [{ suit: "basto", rank: 5 }, { suit: "oro", rank: 1 }, { suit: "basto", rank: 6 }]; // weak trick1, moderate trick2, weak trick3
    const handC: readonly Card[] = [{ suit: "oro", rank: 4 }, { suit: "copa", rank: 4 }, { suit: "basto", rank: 4 }]; // playerC (team A): weak all three tricks — three DISTINCT cards, as a real dealt hand always has
    const handD: readonly Card[] = [{ suit: "copa", rank: 5 }, { suit: "basto", rank: 3 }, { suit: "copa", rank: 6 }]; // weak trick1; trick2's 3-basto wins for team B; weak trick3

    const state = freshTeamHand(handA, handB, handC, handD);
    const teamA = state.teams.find((t) => t.playerIds.includes(playerA))!.id;
    const teamB = state.teams.find((t) => t.playerIds.includes(playerB))!.id;

    // Trick 1: playerA leads (mano). Team A's best is playerA's 1-espada — wins.
    let s = apply(state, { type: "play-card", playerId: playerA, card: handA[0]! });
    s = apply(s, { type: "play-card", playerId: playerB, card: handB[0]! });
    s = apply(s, { type: "play-card", playerId: playerC, card: handC[0]! });
    s = apply(s, { type: "play-card", playerId: playerD, card: handD[0]! });
    expect(s.hand?.trickOutcomes).toHaveLength(1);
    expect(s.hand?.trickOutcomes[0]!.winnerTeamId).toBe(teamA);
    expect(s.hand?.outcome).toEqual({ decided: false });
    expect(s.hand?.turnSeat).toBe(0); // playerA (holder of the winning as de espada) leads trick 2

    // Trick 2: playerA leads again. Team B's best play is playerD's 3-basto (power-ranked
    // above playerB's 1-oro) — team B wins, splitting the tricks 1-1.
    s = apply(s, { type: "play-card", playerId: playerA, card: handA[1]! });
    s = apply(s, { type: "play-card", playerId: playerB, card: handB[1]! });
    s = apply(s, { type: "play-card", playerId: playerC, card: handC[1]! });
    s = apply(s, { type: "play-card", playerId: playerD, card: handD[1]! });
    expect(s.hand?.trickOutcomes).toHaveLength(2);
    expect(s.hand?.trickOutcomes[1]!.winnerTeamId).toBe(teamB);
    // Split tricks (team A won 1, team B won 2) — NOT decided yet; trick 3 must decide.
    expect(s.hand?.outcome).toEqual({ decided: false });
    expect(s.hand?.turnSeat).toBe(3); // playerD (holder of the winning 3-basto) leads trick 3

    // Trick 3: playerD leads; turn order goes around the table (3 -> 0 -> 1 -> 2).
    // Team A's best play is playerA's 3-espada, decisively out-ranking team B's trick-3 cards.
    s = apply(s, { type: "play-card", playerId: playerD, card: handD[2]! });
    s = apply(s, { type: "play-card", playerId: playerA, card: handA[2]! });
    s = apply(s, { type: "play-card", playerId: playerB, card: handB[2]! });
    s = apply(s, { type: "play-card", playerId: playerC, card: handC[2]! });

    expect(s.hand?.trickOutcomes).toHaveLength(3);
    expect(s.hand?.trickOutcomes[2]!.winnerTeamId).toBe(teamA);
    // The 1v1 hand-winner rule this project already fixed once (obs 2918: NOT
    // "first non-tied trick winner", but the actual decider on a split) holds
    // unchanged through the full 4-player pipeline: trick 3's winner (team A)
    // takes the hand, even though team B won trick 2.
    expect(s.hand?.outcome).toEqual({ decided: true, winnerTeamId: teamA });
    expect(s.teams.find((t) => t.id === teamA)!.score).toBe(1);
  });
});
