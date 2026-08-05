import { describe, expect, it, vi } from "vitest";
import { describeGameModule } from "@hexdev/platform-contract";
import type { PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import type { Card, MatchConfig, MatchState } from "@hexdev/truco-engine";
import { SYSTEM_ACTOR_ID, trucoModule } from "./index.js";
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
  const dealt = trucoModule.applyAction(created, { type: "start-hand", playerId: SYSTEM_ACTOR_ID, deal: [handA, handB] });
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
    const result = trucoModule.applyAction(state, { type: "start-hand", playerId: SYSTEM_ACTOR_ID, deal: [handA, handB] });
    expect(result.ok).toBe(false);
  });

  it("maps the winning team's players onto MatchOutcome.winnerIds, never exposing a TeamId", () => {
    const outcome = trucoModule.getOutcome(terminalFixtureState());
    expect(outcome).not.toBeNull();
    expect(outcome?.winnerIds).toEqual([playerAId]);
  });
});

describe("truco-module: createBot wires REAL tiers (PR9's placeholder is gone)", () => {
  it("the easy tier's real 'never volunteer truco' rule is reachable through createBot, not just legal[0]", async () => {
    // player B is mano at a freshly dealt hand, so BOTH call-truco and a
    // card play are legal for them — getLegalActions returns truco actions
    // FIRST, so the old placeholder (`chooseFirstLegalAction`) would have
    // picked call-truco here. The real easy tier must not.
    const state = dealtFixtureState();
    const legal = trucoModule.getLegalActions(state, playerBId);
    expect(legal.some((action) => action.type === "call-truco")).toBe(true);
    expect(legal.some((action) => action.type === "play-card")).toBe(true);
    const view = trucoModule.getViewFor(state, playerBId);
    const bot = trucoModule.createBot("easy");
    const chosen = await bot.chooseAction(view, legal, 50);
    expect(chosen.type).toBe("play-card");
  });

  it("wraps whichever tier it returns with the ~1s thinking delay (real setTimeout, proven with fake timers)", async () => {
    vi.useFakeTimers();
    const state = dealtFixtureState();
    const legal = trucoModule.getLegalActions(state, playerBId);
    const view = trucoModule.getViewFor(state, playerBId);
    const bot = trucoModule.createBot("easy");
    let resolved = false;
    void Promise.resolve(bot.chooseAction(view, legal, 50)).then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(resolved).toBe(true);
    vi.useRealTimers();
  });

  it("the hard tier is wired too and still always returns a legal action", async () => {
    const state = dealtFixtureState();
    const legal = trucoModule.getLegalActions(state, playerBId);
    const view = trucoModule.getViewFor(state, playerBId);
    const bot = trucoModule.createBot("hard");
    const chosen = await bot.chooseAction(view, legal, 50);
    expect(legal).toContainEqual(chosen);
  });
});
