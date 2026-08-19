import { describe, expect, it } from "vitest";
import { createBotStrategy } from "@hexdev/truco-bot";
import type { PlayerId, RandomSource, SeatAssignment } from "@hexdev/platform-contract";
import type { Action, MatchConfig, MatchState, PlayerView } from "@hexdev/truco-engine";
import { requestSystemAction, requestSystemAction2v2, trucoModule, trucoModule2v2 } from "./index.js";

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

// ————————————————————————————————————————————————————————————————————————
// 2v2: the same seeded-tournament evidence, generalized to four seats.
// ————————————————————————————————————————————————————————————————————————

const playerCId = "player-c" as PlayerId;
const playerDId = "player-d" as PlayerId;

/** Partners sit ACROSS the table (seats 0/2 vs 1/3 — truco-engine's own
 * `createTeamMatch` geometry, same as team.test.ts): A/C are one team, B/D
 * the other. */
const seats2v2: readonly SeatAssignment[] = [
  { seat: 0, playerId: playerAId },
  { seat: 1, playerId: playerBId },
  { seat: 2, playerId: playerCId },
  { seat: 3, playerId: playerDId },
];

const seatPlayerIds2v2 = [playerAId, playerBId, playerCId, playerDId] as const;

/**
 * The driver-side twin of the server's `isNonBlockingAction` registration
 * (platform-core's `NonBlockingActionClassifier`, whose docstring tells the
 * whole story): `send-sena` is legal CONTINUOUSLY for any player with a
 * teammate, independent of whose turn it is. A driver that treats "this seat
 * has ANY legal action" as "this seat must act now" keeps auto-driving a
 * seat whose only legal move is a seña and starves the real pending decision
 * forever — the exact reproduced 2000-step deadlock that classifier exists
 * to close. So this driver both SELECTS actors by their blocking actions
 * only and HANDS bots only blocking actions (mirroring `MatchRoom`'s own
 * pre-filter before `chooseAction` — a tier must never silently spend a
 * seña quota entry just because the action list offered one).
 */
function blockingLegalActions2v2(state: MatchState, playerId: PlayerId): readonly Action[] {
  return trucoModule2v2.getLegalActions(state, playerId).filter((action) => action.type !== "send-sena") as readonly Action[];
}

/** Four-seat generalization of `actingPlayerId` above, same disclosed
 * simplification: the turn seat gets first refusal, and the OTHER seats are
 * scanned in table order only when it has nothing blocking to do (e.g. it
 * must wait for an answer to its own pending call). Applied identically
 * regardless of which tier sits where, so it cannot bias the tournament
 * toward either team. */
function actingPlayerId2v2(state: MatchState): PlayerId {
  const turnSeat = state.hand!.turnSeat;
  for (let offset = 0; offset < seatPlayerIds2v2.length; offset += 1) {
    const playerId = seatPlayerIds2v2[(turnSeat + offset) % seatPlayerIds2v2.length]!;
    if (blockingLegalActions2v2(state, playerId).length > 0) return playerId;
  }
  throw new Error("tournament 2v2: no seat has a blocking legal action — driver bug");
}

/** 2v2 hands take up to twice the plays of 1v1 hands (four cards per trick),
 * so the 1v1 `MAX_STEPS` is doubled rather than shared — still a hard cap
 * that turns a driver deadlock into a loud failure instead of a hang. */
const MAX_STEPS_2V2 = 800;

/** `playMatch`, four-seat form: same raw-strategy, no-thinking-delay
 * discipline, driving `trucoModule2v2`/`requestSystemAction2v2`. Returns the
 * winning TEAM's two player ids. */
async function playMatch2v2(
  rng: RandomSource,
  botForSeat: readonly [ReturnType<typeof createBotStrategy>, ReturnType<typeof createBotStrategy>, ReturnType<typeof createBotStrategy>, ReturnType<typeof createBotStrategy>],
): Promise<readonly PlayerId[]> {
  let state: MatchState = trucoModule2v2.createMatch(config, seats2v2);

  for (let step = 0; step < MAX_STEPS_2V2; step += 1) {
    const outcome = trucoModule2v2.getOutcome(state);
    if (outcome !== null) {
      if (outcome.winnerIds.length !== 2) throw new Error("tournament 2v2: expected a two-player winning team");
      return outcome.winnerIds;
    }

    if (state.hand === null || state.hand.outcome.decided) {
      const deal = requestSystemAction2v2(state, rng);
      if (deal === null) throw new Error("tournament 2v2: expected a system deal but got none");
      const applied = trucoModule2v2.applyAction(state, deal);
      if (!applied.ok) throw new Error(`tournament 2v2: system deal rejected: ${applied.violation.message}`);
      state = applied.state;
      continue;
    }

    const actingId = actingPlayerId2v2(state);
    const legal = blockingLegalActions2v2(state, actingId);
    const view = trucoModule2v2.getViewFor(state, actingId) as PlayerView;
    const bot = botForSeat[seatPlayerIds2v2.indexOf(actingId)]!;
    const action = (await bot.chooseAction(view, legal, 50)) as Action;
    const applied = trucoModule2v2.applyAction(state, action);
    if (!applied.ok) throw new Error(`tournament 2v2: bot chose an illegal action: ${applied.violation.message}`);
    state = applied.state;
  }
  throw new Error(`tournament 2v2: a match did not terminate within ${MAX_STEPS_2V2} steps — likely a driver bug`);
}

describe("hard team vs easy team — seeded 2v2 tournament", () => {
  it("a team of two hard bots beats a team of two easy bots significantly more often over deterministic seeds", async () => {
    // Fewer seeds than the 1v1 tournament, deliberately: a 2v2 match has
    // roughly twice the decisions and TWO sampling hard bots, so 24 seeds
    // keeps this in the same wall-clock budget as the 60-seed 1v1 run
    // above. Half with the hard pair on seats 0/2, half on 1/3 — the same
    // seat/dealer-order bias cancellation as the 1v1 tournament.
    const SEEDS = 24;
    let hardWins = 0;

    for (let seed = 0; seed < SEEDS; seed += 1) {
      const rng = seededRng(seed + 1);
      const hardOnTeamA = seed % 2 === 0;
      const bots = Array.from({ length: 4 }, (_, seat) => {
        const seatIsTeamA = seat % 2 === 0; // teams are seat parity: 0/2 vs 1/3
        return createBotStrategy(seatIsTeamA === hardOnTeamA ? "hard" : "easy", rng);
      }) as unknown as Parameters<typeof playMatch2v2>[1];
      const winnerIds = await playMatch2v2(rng, bots);
      const hardMemberId = hardOnTeamA ? playerAId : playerBId;
      if (winnerIds.includes(hardMemberId)) hardWins += 1;
    }

    const winRate = hardWins / SEEDS;
    // Deliberate: the real numbers are the evidence this test exists to produce.
    console.log(`hard team vs easy team — ${SEEDS} seeded 2v2 matches, hard won ${hardWins}/${SEEDS} (${(winRate * 100).toFixed(1)}%)`);
    expect(winRate).toBeGreaterThan(0.65);
  });
});
