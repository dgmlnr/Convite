import { describe, expect, it } from "vitest";
import { describeGameModule } from "@hexdev/platform-contract";
import type { PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import type { Card, MatchConfig, MatchState } from "@hexdev/truco-engine";
import { trucoModule } from "./index.js";
import type { TrucoModuleAction } from "./index.js";

const playerAId = "player-a" as PlayerId;
const playerBId = "player-b" as PlayerId;
const seats: readonly SeatAssignment[] = [
  { seat: 0, playerId: playerAId },
  { seat: 1, playerId: playerBId },
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

function dealtFixtureState(): MatchState {
  const created = trucoModule.createMatch(config, seats);
  const dealt = trucoModule.applyAction(created, { type: "start-hand", deal: [handA, handB] });
  if (!dealt.ok) throw new Error("fixture setup: dealing the first hand failed");
  return dealt.state;
}

function terminalFixtureState(): MatchState {
  const state = dealtFixtureState();
  return { ...state, teams: state.teams.map((team) => ({ ...team, score: config.pointsToWin })) };
}

const legalAction: TrucoModuleAction = { type: "call-truco", playerId: playerAId, level: "truco" };

describeGameModule(
  trucoModule,
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

describe("truco-module: adapter-specific behavior beyond the generic contract", () => {
  it("rejects starting a new hand while one is already in progress", () => {
    const state = dealtFixtureState();
    const result = trucoModule.applyAction(state, { type: "start-hand", deal: [handA, handB] });
    expect(result.ok).toBe(false);
  });

  it("maps the winning team's players onto MatchOutcome.winnerIds, never exposing a TeamId", () => {
    const outcome = trucoModule.getOutcome(terminalFixtureState());
    expect(outcome).not.toBeNull();
    expect(outcome?.winnerIds).toEqual([playerAId]);
  });
});
