import { describe, expect, it } from "vitest";
import type { PlayerId } from "./ids.js";
import { createHeadToHeadMatch, createTeamMatch, startHand } from "./match.js";
import type { MatchState } from "./match.js";
import { applyAction, getLegalActions } from "./truco-chain.js";
import type { Action } from "./truco-chain.js";
import { SENA_SIGNALS } from "./senas.js";

const playerA = "player-a" as PlayerId;
const playerB = "player-b" as PlayerId;
const playerC = "player-c" as PlayerId;
const playerD = "player-d" as PlayerId;

function apply(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`expected legal action, got violation: ${result.violation}`);
  return result.state;
}

function freshTeamHand(): MatchState {
  const state = createTeamMatch({ seatOrder: [playerA, playerB, playerC, playerD], pointsToWin: 15 });
  return startHand(state, [[], [], [], []]);
}

function freshHeadToHeadHand(): MatchState {
  const state = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
  return startHand(state, [[], []]);
}

describe("señas — closed vocabulary (design: model the SIGNAL, not free-form chat)", () => {
  it("the vocabulary is exactly the six canonical top-card signals, nothing else", () => {
    expect([...SENA_SIGNALS].sort()).toEqual(
      ["asDeBasto", "asDeEspada", "dos", "sieteDeEspada", "sieteDeOro", "tres"].sort(),
    );
  });
});

describe("getLegalActions — send-sena is only offered in 2v2 (a player with a teammate)", () => {
  it("is legal for a player whose team has a partner", () => {
    const state = freshTeamHand();
    expect(getLegalActions(state, playerA)).toContainEqual({ type: "send-sena", playerId: playerA, signal: "asDeEspada" });
  });

  it("is NOT offered in a 1v1 match — there is no teammate to signal", () => {
    const state = freshHeadToHeadHand();
    expect(getLegalActions(state, playerA).some((a) => a.type === "send-sena")).toBe(false);
    expect(getLegalActions(state, playerB).some((a) => a.type === "send-sena")).toBe(false);
  });

  it("offers all six signals, for every player (a seña is a CLAIM, not validated against the hand — bluffing is allowed)", () => {
    const state = freshTeamHand();
    const sendActions = getLegalActions(state, playerC).filter((a) => a.type === "send-sena");
    expect(sendActions.map((a) => (a as { signal: string }).signal).sort()).toEqual([...SENA_SIGNALS].sort());
  });
});

describe("applyAction — send-sena records the signal without validating it against the sender's hand", () => {
  it("records the signal for the sending player, even though they hold none of the signaled card", () => {
    const state = freshTeamHand(); // players were dealt empty hands
    const signaled = apply(state, { type: "send-sena", playerId: playerA, signal: "asDeEspada" });

    expect(signaled.hand?.senas).toContainEqual({ playerId: playerA, teamId: signaled.players[0]!.teamId, signal: "asDeEspada", seq: 1 });
  });

  it("a later signal from the same player REPLACES their earlier one, rather than accumulating", () => {
    const first = apply(freshTeamHand(), { type: "send-sena", playerId: playerA, signal: "asDeEspada" });
    const second = apply(first, { type: "send-sena", playerId: playerA, signal: "tres" });

    const mine = second.hand?.senas.filter((s) => s.playerId === playerA);
    expect(mine).toEqual([{ playerId: playerA, teamId: second.players[0]!.teamId, signal: "tres", seq: 2 }]);
  });

  it("re-sending the SAME signal still bumps the ordinal — the only thing that lets a viewer tell 'signaled again' apart from 'nothing happened'", () => {
    const first = apply(freshTeamHand(), { type: "send-sena", playerId: playerA, signal: "asDeEspada" });
    const again = apply(first, { type: "send-sena", playerId: playerA, signal: "asDeEspada" });

    const before = first.hand!.senas.find((s) => s.playerId === playerA)!;
    const after = again.hand!.senas.find((s) => s.playerId === playerA)!;
    expect(after.signal).toBe(before.signal);
    expect(after.seq).toBeGreaterThan(before.seq);
  });

  it("ordinals stay strictly increasing across senders, so a replaced entry never reuses a spent ordinal", () => {
    let state = apply(freshTeamHand(), { type: "send-sena", playerId: playerA, signal: "asDeEspada" });
    state = apply(state, { type: "send-sena", playerId: playerC, signal: "tres" });
    state = apply(state, { type: "send-sena", playerId: playerA, signal: "dos" });

    expect(state.hand!.senas.map((s) => s.seq)).toEqual([2, 3]); // playerC's 2 survives, playerA's 1 was replaced by 3
  });

  it("a fresh hand starts the ordinals over — señas are hand-scoped, exactly like the rest of `HandState`", () => {
    const signaled = apply(freshTeamHand(), { type: "send-sena", playerId: playerA, signal: "dos" });
    const redealt = startHand(signaled, [[], [], [], []]);
    const afterRedeal = apply(redealt, { type: "send-sena", playerId: playerA, signal: "dos" });

    expect(afterRedeal.hand!.senas.map((s) => s.seq)).toEqual([1]);
  });

  it("does not mutate the input state", () => {
    const state = freshTeamHand();
    const before = JSON.stringify(state);
    applyAction(state, { type: "send-sena", playerId: playerA, signal: "dos" });
    expect(JSON.stringify(state)).toBe(before);
  });

  it("rejects send-sena in a 1v1 match even if crafted directly (never trust legality to the client alone)", () => {
    const state = freshHeadToHeadHand();
    const result = applyAction(state, { type: "send-sena", playerId: playerA, signal: "dos" });
    expect(result.ok).toBe(false);
  });
});
