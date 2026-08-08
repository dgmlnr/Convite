import { describe, expect, it } from "vitest";
import type { Card } from "./card.js";
import type { PlayerId } from "./ids.js";
import { createHeadToHeadMatch, getMatchWinner, rotateDealer, startHand } from "./match.js";
import type { MatchState } from "./match.js";
import { applyAction, getLegalActions } from "./truco-chain.js";
import type { Action } from "./truco-chain.js";

const playerA = "player-a" as PlayerId;
const playerB = "player-b" as PlayerId;

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
    expect(getLegalActions(accepted, playerB).some((a) => a.type === "play-card")).toBe(false);
    // The only thing legal for anyone is resolving the reveal — never a raw play-card.
    expect(getLegalActions(accepted, playerA)).toEqual([{ type: "reveal-envido", playerId: playerA }]);

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

    // A non-terminal hand starts a fresh, mano-rotated hand — same pattern the
    // truco-decline path already uses (match.test.ts): the engine does not
    // auto-advance; the caller rotates and deals explicitly.
    expect(getMatchWinner(s)).toBeNull();
    const nextHand = startHand(rotateDealer(s), [[], []]);
    expect(nextHand.hand?.manoSeat).not.toBe(s.hand?.manoSeat);
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
