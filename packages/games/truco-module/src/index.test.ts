import { describe, expect, it, vi } from "vitest";
import { describeGameModule } from "@hexdev/platform-contract";
import type { PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import type { Card, MatchConfig, MatchState } from "@hexdev/truco-engine";
import { SYSTEM_ACTOR_ID, trucoModule } from "./index.js";
import type { TrucoModuleAction } from "./index.js";
import { DEFAULT_THINKING_DELAY_MS } from "@hexdev/truco-bot";

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

/** playerB, not playerA, and that is the module's own geometry rather than a
 * preference: `createMatch` leaves the dealer at seat 0, so the mano is seat
 * 1 — and opening a call is taking the floor, which starts with the mano
 * (truco-engine's `getLegalTrucoActions`). */
const legalAction: TrucoModuleAction = { type: "call-truco", playerId: playerBId, level: "truco" };

describeGameModule(
  trucoModule,
  {
    config,
    seats,
    playerId: playerBId,
    reachableState: dealtFixtureState(),
    legalAction,
    terminalState: terminalFixtureState(),
    botTier: "easy",
  },
  { describe, it, expect },
);

describe("truco-module: only the system deals", () => {
  /**
   * The reproduction, at the reducer. A seated player submitting `start-hand`
   * under their OWN id used to be accepted here — the module gated only on
   * "the match is not over" and "no hand is in progress", never on WHO was
   * asking — and the `deal` an action carries is the whole table, so the
   * sender chose both hands. `deal.ts`'s own docstring claimed the sentinel
   * made that impossible; it never did, and the correction is recorded there.
   *
   * `MatchRoom.handleAction` refuses it as well now (no game ever offers a
   * `start-hand`), which is the fix that closes this for every game at once.
   * This one is the game's own copy of the rule, and it holds for any caller
   * of a pure reducer, transport or not.
   */
  it("refuses a start-hand submitted by a seated player, before it can look at anything else", () => {
    const created = trucoModule.createMatch(config, seats);
    // The window the cheat used: no hand yet, no winner, so every OTHER gate
    // in this branch is open. Nothing but the actor check stands here.
    expect(trucoModule.getLegalActions(created, playerAId).some((action) => action.type === "start-hand")).toBe(false);

    const result = trucoModule.applyAction(created, { type: "start-hand", playerId: playerAId, deal: [handA, handB] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violation.code).toBe("not-a-system-actor");
  });

  it("still deals for the system actor — the guard refuses an impostor, not the dealer", () => {
    const created = trucoModule.createMatch(config, seats);
    const result = trucoModule.applyAction(created, { type: "start-hand", playerId: SYSTEM_ACTOR_ID, deal: [handA, handB] });
    expect(result.ok).toBe(true);
  });
});

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
    // `createBot` is optional on the port now (a solitaire has no opponent).
    // Asserting it here would duplicate the fence that owns it: conformance
    // demands a bot of every module declaring two or more seats, by name.
    const bot = trucoModule.createBot!("easy");
    const chosen = await bot.chooseAction(view, legal, 50);
    expect(chosen.type).toBe("play-card");
  });

  it("wraps whichever tier it returns with the thinking delay (real setTimeout, proven with fake timers)", async () => {
    vi.useFakeTimers();
    try {
      const state = dealtFixtureState();
      const legal = trucoModule.getLegalActions(state, playerBId);
      const view = trucoModule.getViewFor(state, playerBId);
      const bot = trucoModule.createBot!("easy");
      let resolved = false;
      void Promise.resolve(bot.chooseAction(view, legal, 50)).then(() => {
        resolved = true;
      });

      // Driven from the CONSTANT, not from a copy of its value. This test
      // used to hardcode 500/600 around a 1s delay, so raising that delay
      // broke it — and then leaked fake timers into the next test, which
      // failed as a five-second timeout that had nothing to do with its own
      // subject. Expressed this way the assertion states the property (the
      // wrapper waits out the delay) and survives any future tuning of it.
      await vi.advanceTimersByTimeAsync(DEFAULT_THINKING_DELAY_MS - 100);
      expect(resolved, "still waiting just before the delay elapses").toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(resolved, "resolved once it has").toBe(true);
    } finally {
      // In a `finally` for the same reason: a failed expectation above must
      // not leave every later test running on frozen timers.
      vi.useRealTimers();
    }
  });

  it("the hard tier is wired too and still always returns a legal action", async () => {
    const state = dealtFixtureState();
    const legal = trucoModule.getLegalActions(state, playerBId);
    const view = trucoModule.getViewFor(state, playerBId);
    const bot = trucoModule.createBot!("hard");
    const chosen = await bot.chooseAction(view, legal, 50);
    expect(legal).toContainEqual(chosen);
  });
});
