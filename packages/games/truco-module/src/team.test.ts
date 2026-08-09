import { describe, expect, it } from "vitest";
import { describeGameModule } from "@hexdev/platform-contract";
import type { PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import type { Card, MatchConfig, MatchState } from "@hexdev/truco-engine";
import { SYSTEM_ACTOR_ID, trucoModule2v2 } from "./index.js";
import type { TrucoModuleAction } from "./index.js";

const playerAId = "player-a" as PlayerId;
const playerBId = "player-b" as PlayerId;
const playerCId = "player-c" as PlayerId;
const playerDId = "player-d" as PlayerId;

// Partners sit ACROSS the table (seats 0/2 vs 1/3, per truco-engine's own
// createTeamMatch geometry, matching the four-anchor UI) — player A and C
// are teammates, player B and D are teammates.
const seats: readonly SeatAssignment[] = [
  { seat: 0, playerId: playerAId },
  { seat: 1, playerId: playerBId },
  { seat: 2, playerId: playerCId },
  { seat: 3, playerId: playerDId },
];
const config: MatchConfig = { pointsToWin: 15 };

const handA: readonly Card[] = [
  { suit: "espada", rank: 1 },
  { suit: "basto", rank: 1 },
  { suit: "oro", rank: 1 },
];
const handB: readonly Card[] = [
  { suit: "copa", rank: 4 },
  { suit: "espada", rank: 4 },
  { suit: "basto", rank: 4 },
];
const handC: readonly Card[] = [
  { suit: "oro", rank: 5 },
  { suit: "copa", rank: 5 },
  { suit: "espada", rank: 5 },
];
const handD: readonly Card[] = [
  { suit: "basto", rank: 6 },
  { suit: "oro", rank: 6 },
  { suit: "copa", rank: 6 },
];

function dealtFixtureState(): MatchState {
  const created = trucoModule2v2.createMatch(config, seats);
  const dealt = trucoModule2v2.applyAction(created, {
    type: "start-hand",
    playerId: SYSTEM_ACTOR_ID,
    deal: [handA, handB, handC, handD],
  });
  if (!dealt.ok) throw new Error("fixture setup: dealing the first 2v2 hand failed");
  return dealt.state;
}

function terminalFixtureState(): MatchState {
  const state = dealtFixtureState();
  return { ...state, teams: state.teams.map((team) => ({ ...team, score: config.pointsToWin })) };
}

const legalAction: TrucoModuleAction = { type: "call-truco", playerId: playerAId, level: "truco" };

describeGameModule(
  trucoModule2v2,
  {
    config,
    seats,
    playerId: playerAId,
    reachableState: dealtFixtureState(),
    legalAction,
    terminalState: terminalFixtureState(),
    botTier: "easy",
  },
  { describe, it, expect },
);

describe("truco-module: 2v2 adapter, additive to the 1v1 module (obs 2927's roadmap)", () => {
  it("registers under a DISTINCT gameId — never the 1v1 module's id", () => {
    expect(trucoModule2v2.id).toBe("truco-argentino-2v2");
  });

  it("declares a 4-seat metadata.seatCount, never mutating the 1v1 module's own 2-seat metadata", () => {
    expect(trucoModule2v2.metadata.seatCount).toBe(4);
  });

  it("rejects createMatch with anything other than exactly 4 seats", () => {
    expect(() => trucoModule2v2.createMatch(config, seats.slice(0, 2))).toThrow();
  });

  it("seats partners ACROSS the table (0/2 vs 1/3) — verified via each player's own view", () => {
    const state = dealtFixtureState();
    const viewOfA = trucoModule2v2.getViewFor(state, playerAId);
    expect(viewOfA.teammates.map((t) => t.playerId)).toEqual([playerCId]);
    expect(viewOfA.opponents.map((o) => o.playerId).sort()).toEqual([playerBId, playerDId].sort());
  });

  it("señas are legal in a 2v2 match — the exact feature that stays absent from 1v1 by construction", () => {
    const state = dealtFixtureState();
    const legal = trucoModule2v2.getLegalActions(state, playerAId);
    expect(legal.some((action) => action.type === "send-sena")).toBe(true);
  });

  it("maps a winning TEAM's two players onto MatchOutcome.winnerIds", () => {
    const outcome = trucoModule2v2.getOutcome(terminalFixtureState());
    expect(outcome).not.toBeNull();
    expect(outcome?.winnerIds.slice().sort()).toEqual([playerAId, playerCId].sort());
  });
});
