import { describe, expect, it } from "vitest";
import { createBotStrategy } from "@hexdev/truco-bot";
import { MAX_SENAS_PER_HAND } from "@hexdev/truco-engine";
import type { PlayerId, RandomSource, SeatAssignment } from "@hexdev/platform-contract";
import type { Action, MatchConfig, MatchState, PlayerView } from "@hexdev/truco-engine";
import { requestSystemAction2v2, trucoModule2v2 } from "./index.js";

/**
 * THE CONVERGENCE EVIDENCE FOR BOT SEÑA EMISSION. The tournament driver
 * (tournament.test.ts) hands bots only BLOCKING actions — replicating the
 * server's timeout path, where a tier must never spend a player's quota. This
 * driver instead replicates the server's NORMAL driving loop
 * (`MatchRoom.runAdvanceOnce`): the actor is still selected by its blocking
 * actions, but `chooseAction` receives the FULL legal list, señas included —
 * exactly what a bot seat sees in production. What this file must prove is
 * that the emission gate cannot wedge that loop: a bot offered a seña on
 * every single call spends at most `MAX_SENAS_PER_HAND` of them per hand
 * (the engine stops offering at the cap — the ABSOLUTE bound, independent of
 * any rng), then takes its blocking action, and the match still terminates.
 */

const playerAId = "player-a" as PlayerId;
const playerBId = "player-b" as PlayerId;
const playerCId = "player-c" as PlayerId;
const playerDId = "player-d" as PlayerId;

const seats2v2: readonly SeatAssignment[] = [
  { seat: 0, playerId: playerAId },
  { seat: 1, playerId: playerBId },
  { seat: 2, playerId: playerCId },
  { seat: 3, playerId: playerDId },
];

const seatPlayerIds2v2 = [playerAId, playerBId, playerCId, playerDId] as const;
const config: MatchConfig = { pointsToWin: 15 };

/** Same generator as the tournament — reproducibility over luck. */
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

/** Actor selection stays BLOCKING-only (`findActingBot`'s rule): a seat whose
 * only legal move is a seña does not owe the table anything — driving it
 * anyway is the reproduced starvation deadlock the classifier exists to
 * close. Only the ACTION LIST handed to the chosen actor is unfiltered. */
function hasBlockingAction(state: MatchState, playerId: PlayerId): boolean {
  return trucoModule2v2.getLegalActions(state, playerId).some((action) => action.type !== "send-sena");
}

function actingPlayerId2v2(state: MatchState): PlayerId {
  const turnSeat = state.hand!.turnSeat;
  for (let offset = 0; offset < seatPlayerIds2v2.length; offset += 1) {
    const playerId = seatPlayerIds2v2[(turnSeat + offset) % seatPlayerIds2v2.length]!;
    if (hasBlockingAction(state, playerId)) return playerId;
  }
  throw new Error("sena convergence: no seat has a blocking legal action — driver bug");
}

/** The tournament's 2v2 cap plus headroom for the señas themselves: four
 * players × MAX_SENAS_PER_HAND extra steps per hand is bounded by the
 * engine's own quota, so the cap stays a loud-failure fence, never a wait. */
const MAX_STEPS = 1200;

interface SenaSpend {
  /** Total accepted señas across the whole match, all four seats. */
  readonly total: number;
  /** The highest per-player count observed within any single hand. */
  readonly maxPerPlayerPerHand: number;
}

/** Full-list driving loop; counts every accepted send-sena per player per
 * hand (counts reset on each system deal, matching the engine's own per-hand
 * quota scope) and returns the spend alongside proof of termination. */
async function playMatchWithSenas(
  rng: RandomSource,
  botForSeat: readonly [ReturnType<typeof createBotStrategy>, ReturnType<typeof createBotStrategy>, ReturnType<typeof createBotStrategy>, ReturnType<typeof createBotStrategy>],
): Promise<SenaSpend> {
  let state: MatchState = trucoModule2v2.createMatch(config, seats2v2);
  let total = 0;
  let maxPerPlayerPerHand = 0;
  let perPlayerThisHand = new Map<PlayerId, number>();

  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (trucoModule2v2.getOutcome(state) !== null) return { total, maxPerPlayerPerHand };

    if (state.hand === null || state.hand.outcome.decided) {
      const deal = requestSystemAction2v2(state, rng);
      if (deal === null) throw new Error("sena convergence: expected a system deal but got none");
      const applied = trucoModule2v2.applyAction(state, deal);
      if (!applied.ok) throw new Error(`sena convergence: system deal rejected: ${applied.violation.message}`);
      state = applied.state;
      perPlayerThisHand = new Map();
      continue;
    }

    const actingId = actingPlayerId2v2(state);
    const legal = trucoModule2v2.getLegalActions(state, actingId) as readonly Action[];
    const view = trucoModule2v2.getViewFor(state, actingId) as PlayerView;
    const bot = botForSeat[seatPlayerIds2v2.indexOf(actingId)]!;
    const action = (await bot.chooseAction(view, legal, 50)) as Action;
    const applied = trucoModule2v2.applyAction(state, action);
    if (!applied.ok) throw new Error(`sena convergence: bot chose an illegal action: ${applied.violation.message}`);
    state = applied.state;

    if (action.type === "send-sena") {
      const count = (perPlayerThisHand.get(actingId) ?? 0) + 1;
      perPlayerThisHand.set(actingId, count);
      total += 1;
      if (count > maxPerPlayerPerHand) maxPerPlayerPerHand = count;
    }
  }
  throw new Error(`sena convergence: a match did not terminate within ${MAX_STEPS} steps — the emission gate wedged the loop`);
}

describe("seña emission — seeded 2v2 convergence under the full-list driving loop", () => {
  it("bots offered señas on every call spend at most the per-hand quota, then act — and every match terminates", async () => {
    // A hard pair vs a normal pair: both emitting tiers under one roof, and
    // few enough seeds (two hard samplers per match, same budget reasoning
    // as the tournament's own 2v2 run) to stay inside the suite's pace.
    const SEEDS = 6;
    let totalSenas = 0;

    for (let seed = 0; seed < SEEDS; seed += 1) {
      const rng = seededRng(seed + 1);
      const bots = Array.from({ length: 4 }, (_, seat) => createBotStrategy(seat % 2 === 0 ? "hard" : "normal", rng)) as unknown as Parameters<
        typeof playMatchWithSenas
      >[1];
      const spend = await playMatchWithSenas(rng, bots);
      expect(spend.maxPerPlayerPerHand).toBeLessThanOrEqual(MAX_SENAS_PER_HAND);
      totalSenas += spend.total;
    }

    // Deliberate: the real number is the evidence this test exists to produce.
    console.log(`sena convergence — ${SEEDS} seeded 2v2 matches, ${totalSenas} señas accepted in total`);
    // Non-zero proves the gate actually fires under real drives — a filter
    // that silently swallowed every seña would pass the cap assertion above.
    expect(totalSenas).toBeGreaterThan(0);
  });
});
