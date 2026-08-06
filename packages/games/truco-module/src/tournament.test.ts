import { describe, expect, it } from "vitest";
import { createBotStrategy } from "@hexdev/truco-bot";
import type { PlayerId, RandomSource, SeatAssignment } from "@hexdev/platform-contract";
import type { Action, MatchConfig, MatchState, PlayerView } from "@hexdev/truco-engine";
import { requestSystemAction, trucoModule } from "./index.js";

/**
 * THE EVIDENCE THAT MATTERS MOST: "the tiers are different" is a claim, not
 * an assumption. This runs many deterministic, seeded, full matches of
 * hard-tier vs easy-tier and asserts hard wins significantly more often.
 * Determinism (a seeded rng driving both the deal AND the hard tier's own
 * determinized sampling) is exactly what makes this reproducible instead of
 * flaky — the same seed always plays out identically.
 */

const playerAId = "player-a" as PlayerId;
const playerBId = "player-b" as PlayerId;
const seats: readonly SeatAssignment[] = [
  { seat: 0, playerId: playerAId },
  { seat: 1, playerId: playerBId },
];
const config: MatchConfig = { pointsToWin: 15 };

function seededRng(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seatPlayerId(seat: number): PlayerId {
  return seat === 0 ? playerAId : playerBId;
}

/** Whoever can act at `state.hand.turnSeat` gets first refusal (mirrors real
 * Truco: the player about to play a card decides whether to call instead);
 * the other seat only acts when the turn seat has nothing legal to do
 * (e.g. it must answer a pending call). A disclosed simulation-driver
 * simplification, not a rule the engine itself enforces — see
 * apply-progress. Applied identically regardless of which bot sits where,
 * so it cannot bias the tournament toward either tier. */
function actingPlayerId(state: MatchState): PlayerId {
  const turnSeat = state.hand!.turnSeat;
  const turnPlayerId = seatPlayerId(turnSeat);
  return trucoModule.getLegalActions(state, turnPlayerId).length > 0 ? turnPlayerId : seatPlayerId(1 - turnSeat);
}

const MAX_STEPS = 400;

/** Plays one full deterministic match to completion and returns the winner.
 * Uses the RAW tier strategies directly (`createBotStrategy`), never
 * `trucoModule.createBot`'s ~1s thinking-delay wrapper — that wrapper is
 * already covered by its own dedicated tests; a tournament of hundreds of
 * matches must stay instant. */
async function playMatch(
  rng: RandomSource,
  botForSeat: readonly [ReturnType<typeof createBotStrategy>, ReturnType<typeof createBotStrategy>],
): Promise<PlayerId> {
  let state: MatchState = trucoModule.createMatch(config, seats);

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const outcome = trucoModule.getOutcome(state);
    if (outcome !== null) {
      if (outcome.winnerIds.length !== 1) throw new Error("tournament: expected exactly one winner in a head-to-head match");
      return outcome.winnerIds[0]!;
    }

    if (state.hand === null || state.hand.outcome.decided) {
      const deal = requestSystemAction(state, rng);
      if (deal === null) throw new Error("tournament: expected a system deal but got none");
      const applied = trucoModule.applyAction(state, deal);
      if (!applied.ok) throw new Error(`tournament: system deal rejected: ${applied.violation.message}`);
      state = applied.state;
      continue;
    }

    const actingId = actingPlayerId(state);
    const legal = trucoModule.getLegalActions(state, actingId);
    const view = trucoModule.getViewFor(state, actingId) as PlayerView;
    const bot = botForSeat[actingId === playerAId ? 0 : 1];
    const action = (await bot.chooseAction(view, legal as readonly Action[], 50)) as Action;
    const applied = trucoModule.applyAction(state, action);
    if (!applied.ok) throw new Error(`tournament: bot chose an illegal action: ${applied.violation.message}`);
    state = applied.state;
  }
  throw new Error(`tournament: a match did not terminate within ${MAX_STEPS} steps — likely a driver bug`);
}

describe("hard vs easy — seeded tournament", () => {
  it("the hard tier wins significantly more often than the easy tier over many deterministic seeds", async () => {
    const SEEDS = 60; // half with hard as seat 0, half as seat 1 — cancels any seat/dealer-order bias
    let hardWins = 0;

    for (let seed = 0; seed < SEEDS; seed += 1) {
      const rng = seededRng(seed + 1);
      const hardIsSeatA = seed % 2 === 0;
      const hard = createBotStrategy("hard", rng);
      const easy = createBotStrategy("easy", rng);
      const botForSeat = (hardIsSeatA ? [hard, easy] : [easy, hard]) as readonly [
        ReturnType<typeof createBotStrategy>,
        ReturnType<typeof createBotStrategy>,
      ];
      const winnerId = await playMatch(rng, botForSeat);
      const hardPlayerId = hardIsSeatA ? playerAId : playerBId;
      if (winnerId === hardPlayerId) hardWins += 1;
    }

    const winRate = hardWins / SEEDS;
    // Deliberate: the real numbers are the evidence this test exists to produce.
    console.log(`hard vs easy — ${SEEDS} seeded matches, hard won ${hardWins}/${SEEDS} (${(winRate * 100).toFixed(1)}%)`);
    expect(winRate).toBeGreaterThan(0.65);
  });
});
