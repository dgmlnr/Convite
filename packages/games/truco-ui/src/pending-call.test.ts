import { describe, expect, it } from "vitest";
import type { Action, HandView, PlayerId, TeamId } from "@hexdev/truco-engine";
import { derivePendingCall, isMyTurnToAnswer, respondingTeamId } from "./pending-call.js";

const CALLING_TEAM = "team-a" as TeamId;
const OTHER_TEAM = "team-b" as TeamId;
const PLAYER = "player-a" as PlayerId;

function baseHand(overrides: Partial<HandView> = {}): HandView {
  return {
    manoSeat: 0,
    truco: { status: "none" },
    envido: { status: "none" },
    turnSeat: 0,
    currentTrickPlays: [],
    resolvedTrickPlays: [],
    callEvents: [],
    trickOutcomes: [],
    outcome: { decided: false },
    ...overrides,
  };
}

describe("derivePendingCall — a call hangs on the table until it is answered", () => {
  it("returns null when there is no hand in progress", () => {
    expect(derivePendingCall(null)).toBeNull();
  });

  it("returns null when neither chain has an open call", () => {
    expect(derivePendingCall(baseHand())).toBeNull();
  });

  it("returns the pending truco call, labeled, with who called it", () => {
    const hand = baseHand({ truco: { status: "pending", level: "truco", callingTeamId: CALLING_TEAM } });

    expect(derivePendingCall(hand)).toEqual({ kind: "truco", levelLabel: "Truco", callingTeamId: CALLING_TEAM });
  });

  it("reflects an escalation — retruco replaces truco as the pending call, not alongside it", () => {
    const hand = baseHand({ truco: { status: "pending", level: "retruco", callingTeamId: CALLING_TEAM } });

    expect(derivePendingCall(hand)).toEqual({ kind: "truco", levelLabel: "Retruco", callingTeamId: CALLING_TEAM });
  });

  it("returns the pending envido call, using the LATEST level in the chain", () => {
    const hand = baseHand({ envido: { status: "pending", calls: ["envido", "envidoEnvido"], callingTeamId: CALLING_TEAM } });

    expect(derivePendingCall(hand)).toEqual({ kind: "envido", levelLabel: "Envido envido", callingTeamId: CALLING_TEAM });
  });

  it("prioritizes a pending envido over a pending truco — envido interrupts and must resolve first (mirrors getLegalTrucoActions)", () => {
    const hand = baseHand({
      truco: { status: "pending", level: "truco", callingTeamId: CALLING_TEAM },
      envido: { status: "pending", calls: ["envido"], callingTeamId: OTHER_TEAM },
    });

    expect(derivePendingCall(hand)?.kind).toBe("envido");
  });

  it("returns null once envido is only 'accepted' (quiero already answered it) — awaiting reveal is not a pending call", () => {
    const hand = baseHand({ envido: { status: "accepted", calls: ["envido"], callingTeamId: CALLING_TEAM, acceptedValue: 2 } });

    expect(derivePendingCall(hand)).toBeNull();
  });

  it("returns null once truco is declined — the hand is over, nothing is hanging", () => {
    const hand = baseHand({
      truco: { status: "declined", level: "truco", callingTeamId: CALLING_TEAM, decliningTeamId: OTHER_TEAM },
    });

    expect(derivePendingCall(hand)).toBeNull();
  });
});

describe("isMyTurnToAnswer — read straight from legalActions, never re-derived", () => {
  it("is true when respond-truco is a legal action", () => {
    const legal: readonly Action[] = [{ type: "respond-truco", playerId: PLAYER, response: "quiero" }];
    expect(isMyTurnToAnswer(legal)).toBe(true);
  });

  it("is true when respond-envido is a legal action", () => {
    const legal: readonly Action[] = [{ type: "respond-envido", playerId: PLAYER, response: "no-quiero" }];
    expect(isMyTurnToAnswer(legal)).toBe(true);
  });

  it("is false when the only legal actions are escalations or card play, not a response", () => {
    const legal: readonly Action[] = [{ type: "call-truco", playerId: PLAYER, level: "retruco" }];
    expect(isMyTurnToAnswer(legal)).toBe(false);
  });

  it("is false with no legal actions at all", () => {
    expect(isMyTurnToAnswer([])).toBe(false);
  });
});

describe("respondingTeamId — the team that owes the answer is never the caller's own team", () => {
  it("returns the other team", () => {
    const teams = [{ id: CALLING_TEAM }, { id: OTHER_TEAM }];
    const call = { kind: "truco" as const, levelLabel: "Truco", callingTeamId: CALLING_TEAM };

    expect(respondingTeamId(call, teams)).toBe(OTHER_TEAM);
  });
});
