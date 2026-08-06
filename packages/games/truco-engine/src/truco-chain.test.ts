import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Card } from "./card.js";
import { buildDeck } from "./deck.js";
import type { PlayerId } from "./ids.js";
import { createHeadToHeadMatch, getMatchWinner, rotateDealer, startHand } from "./match.js";
import type { MatchState, TrucoCallLevel } from "./match.js";
import { applyAction, getLegalActions } from "./truco-chain.js";
import type { Action, TrucoAction } from "./truco-chain.js";

const playerA = "player-a" as PlayerId;
const playerB = "player-b" as PlayerId;

function freshHand(): MatchState {
  const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
  return startHand(state, [[], []]);
}

function apply(state: MatchState, action: TrucoAction): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) {
    throw new Error(`expected legal action, got violation: ${result.violation}`);
  }
  return result.state;
}

/** Escalates truco/retruco/valeCuatro strictly (alternating callers, each
 * accepted) up to and including calling `level`, leaving it pending. Shared
 * by every test below that needs a specific level pending or accepted. */
function pendingAt(level: TrucoCallLevel): MatchState {
  let state = apply(freshHand(), { type: "call-truco", playerId: playerA, level: "truco" });
  if (level === "truco") return state;
  state = apply(state, { type: "respond-truco", playerId: playerB, response: "quiero" });
  state = apply(state, { type: "call-truco", playerId: playerB, level: "retruco" });
  if (level === "retruco") return state;
  state = apply(state, { type: "respond-truco", playerId: playerA, response: "quiero" });
  return apply(state, { type: "call-truco", playerId: playerA, level: "valeCuatro" });
}

describe("getLegalActions — truco call chain", () => {
  it("either player may call truco when nothing is pending (envido is also legal — see envido-chain.test.ts)", () => {
    const state = freshHand();

    expect(getLegalActions(state, playerA)).toEqual([{ type: "call-truco", playerId: playerA, level: "truco" }, { type: "call-envido", playerId: playerA, level: "envido" }]);
    expect(getLegalActions(state, playerB)).toEqual([{ type: "call-truco", playerId: playerB, level: "truco" }, { type: "call-envido", playerId: playerB, level: "envido" }]);
  });

  it("only the non-calling team may respond while a call is pending (envido may still interrupt it — see envido-chain.test.ts for the dedicated opening-gate coverage)", () => {
    const state = pendingAt("truco");

    expect(getLegalActions(state, playerA)).toEqual([{ type: "call-envido", playerId: playerA, level: "envido" }]);
    expect(getLegalActions(state, playerB)).toEqual([
      { type: "respond-truco", playerId: playerB, response: "quiero" },
      { type: "respond-truco", playerId: playerB, response: "no-quiero" },
      { type: "call-envido", playerId: playerB, level: "envido" },
    ]);
  });

  it("only the accepting team may escalate truco after quiero (envido may still interrupt it)", () => {
    const accepted = apply(pendingAt("truco"), { type: "respond-truco", playerId: playerB, response: "quiero" });

    expect(getLegalActions(accepted, playerA)).toEqual([{ type: "call-envido", playerId: playerA, level: "envido" }]);
    expect(getLegalActions(accepted, playerB)).toEqual([
      { type: "call-truco", playerId: playerB, level: "retruco" },
      { type: "call-envido", playerId: playerB, level: "envido" },
    ]);
  });

  it("vale cuatro accepted has no further truco escalation for either team, but envido may still open (first trick, no card played yet)", () => {
    const accepted = apply(pendingAt("valeCuatro"), {
      type: "respond-truco",
      playerId: playerB,
      response: "quiero",
    });

    expect(getLegalActions(accepted, playerA)).toEqual([{ type: "call-envido", playerId: playerA, level: "envido" }]);
    expect(getLegalActions(accepted, playerB)).toEqual([{ type: "call-envido", playerId: playerB, level: "envido" }]);
  });

  it("no truco action is legal after a decline", () => {
    const declined = apply(pendingAt("truco"), { type: "respond-truco", playerId: playerB, response: "no-quiero" });

    expect(getLegalActions(declined, playerA)).toEqual([]);
    expect(getLegalActions(declined, playerB)).toEqual([]);
  });

  it("a fresh hand after a decline offers only a fresh truco call (plus envido), no leftover escalation", () => {
    const declined = apply(pendingAt("truco"), { type: "respond-truco", playerId: playerB, response: "no-quiero" });
    const handTwo = startHand(declined, [[], []]);

    expect(getLegalActions(handTwo, playerA)).toEqual([{ type: "call-truco", playerId: playerA, level: "truco" }, { type: "call-envido", playerId: playerA, level: "envido" }]);
    expect(getLegalActions(handTwo, playerB)).toEqual([{ type: "call-truco", playerId: playerB, level: "truco" }, { type: "call-envido", playerId: playerB, level: "envido" }]);
  });

  it("returns no actions once the hand has not started", () => {
    const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });

    expect(getLegalActions(state, playerA)).toEqual([]);
  });
});

describe("applyAction — legal escalation sequence (spec: truco-rules)", () => {
  it("truco -> quiero -> retruco is legal and pending on the original caller's team", () => {
    const state = pendingAt("retruco");

    expect(state.hand?.truco).toEqual({ status: "pending", level: "retruco", callingTeamId: state.teams[1]!.id });
    expect(getLegalActions(state, playerA)).toEqual([
      { type: "respond-truco", playerId: playerA, response: "quiero" },
      { type: "respond-truco", playerId: playerA, response: "no-quiero" },
      { type: "call-envido", playerId: playerA, level: "envido" },
    ]);
  });
});

describe("applyAction — decline terminates the hand (spec: truco-rules)", () => {
  it.each([
    ["truco" as const, playerB, 1, 0],
    ["retruco" as const, playerA, 0, 2],
    ["valeCuatro" as const, playerB, 3, 0],
  ])("declining a %s call concedes the previous accepted level's value", (level, decliner, scoreA, scoreB) => {
    const state = apply(pendingAt(level), { type: "respond-truco", playerId: decliner, response: "no-quiero" });

    expect(state.teams[0]!.score).toBe(scoreA);
    expect(state.teams[1]!.score).toBe(scoreB);
    expect(state.hand?.truco.status).toBe("declined");
  });

  it("accepting (quiero) never awards points by itself", () => {
    const state = apply(pendingAt("truco"), { type: "respond-truco", playerId: playerB, response: "quiero" });

    expect(state.teams[0]!.score).toBe(0);
    expect(state.teams[1]!.score).toBe(0);
  });
});

describe("applyAction/getLegalActions — match termination (spec: 'Match and Hand Termination')", () => {
  it("a decline that reaches the target ends the match: no further action is legal for either player", () => {
    const almostWonMatch = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
    const oneCallFromTarget: MatchState = {
      ...almostWonMatch,
      teams: [{ ...almostWonMatch.teams[0]!, score: 14 }, almostWonMatch.teams[1]!],
    };
    const called = apply(startHand(oneCallFromTarget, [[], []]), { type: "call-truco", playerId: playerA, level: "truco" });
    const declined = apply(called, { type: "respond-truco", playerId: playerB, response: "no-quiero" });

    expect(getMatchWinner(declined)).toBe(declined.teams[0]!.id);
    expect(getLegalActions(declined, playerA)).toEqual([]);
    expect(getLegalActions(declined, playerB)).toEqual([]);
  });

  it("a decline that does not reach the target leaves the match open for a fresh, mano-rotated hand", () => {
    const declined = apply(pendingAt("truco"), { type: "respond-truco", playerId: playerB, response: "no-quiero" });
    expect(getMatchWinner(declined)).toBeNull();

    const nextHand = startHand(rotateDealer(declined), [[], []]);

    expect(nextHand.hand?.manoSeat).not.toBe(declined.hand?.manoSeat);
    expect(getLegalActions(nextHand, playerA).length).toBeGreaterThan(0);
  });
});

describe("applyAction — illegal actions are rejected, not silently ignored", () => {
  it("rejects escalating straight to retruco without an existing call", () => {
    const result = applyAction(freshHand(), { type: "call-truco", playerId: playerA, level: "retruco" });

    expect(result.ok).toBe(false);
  });

  it("rejects the calling team responding to its own call", () => {
    const result = applyAction(pendingAt("truco"), { type: "respond-truco", playerId: playerA, response: "quiero" });

    expect(result.ok).toBe(false);
  });

  it("rejects an action from an unknown player", () => {
    const result = applyAction(freshHand(), {
      type: "call-truco",
      playerId: "ghost" as PlayerId,
      level: "truco",
    });

    expect(result.ok).toBe(false);
  });

  it("does not mutate the input state", () => {
    const state = freshHand();
    const before = JSON.stringify(state);

    applyAction(state, { type: "call-truco", playerId: playerA, level: "truco" });

    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("applyAction — full purity property over the combined truco+envido action space (spec: 'applyAction is pure')", () => {
  it("for any reachable state and any of its legal actions, applying twice yields equal results and never mutates the input", () => {
    const dealArb = fc.shuffledSubarray(buildDeck() as Card[], { minLength: 6, maxLength: 6 });
    const walkArb = fc.array(fc.nat({ max: 9 }), { maxLength: 15 });

    fc.assert(
      fc.property(dealArb, walkArb, fc.nat({ max: 9 }), (cards, walk, finalStep) => {
        const fresh = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
        let state = startHand(fresh, [cards.slice(0, 3), cards.slice(3, 6)]);
        for (const step of walk) {
          const legal = [...getLegalActions(state, playerA), ...getLegalActions(state, playerB)];
          if (legal.length === 0) break;
          const result = applyAction(state, legal[step % legal.length]!);
          if (result.ok) state = result.state;
        }

        const legal: readonly Action[] = [...getLegalActions(state, playerA), ...getLegalActions(state, playerB)];
        if (legal.length === 0) return true; // match/hand already terminal — nothing left to apply

        const action = legal[finalStep % legal.length]!;
        const before = JSON.stringify(state);
        const first = applyAction(state, action);
        const second = applyAction(state, action);

        return JSON.stringify(state) === before && JSON.stringify(first) === JSON.stringify(second);
      }),
    );
  });
});
