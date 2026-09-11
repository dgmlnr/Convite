import { describe, expect, it } from "vitest";
import type { RandomSource } from "@hexdev/platform-contract";
import type { MatchState, PlayerId } from "@hexdev/mentiroso-engine";
import {
  applyDoubt,
  applyOpeningDrawRoll,
  applyRaise,
  applyRoundRoll,
  createMatch,
  getLegalActions,
  getOutcome,
  getViewFor,
  resolveShowdown,
} from "@hexdev/mentiroso-engine";
import { drawDie } from "./determinize.js";
import { createEasyBot } from "./easy.js";
import { createHardBot } from "./hard.js";
import { createNormalBot } from "./normal.js";
import { seededRng } from "./fixtures.js";
import type { MentirosoTier, NonEmptyActions } from "./tier.js";

/**
 * THE MEASUREMENT THAT DEFINES THE FRONTIER (SDD `mentiroso`, work unit
 * D4/task 4.4, design D7's own words: "the tier boundary is MEASURED, never
 * declared"). "hard beats normal beats easy" is a CLAIM about this file's
 * own three tiers, not an assumption — this drives many deterministic,
 * seeded, full 2-seat matches and reports what actually happens.
 *
 * PLACEMENT: this driver lives in `mentiroso-bot`, matching this unit's own
 * `pnpm test mentiroso-bot` focused command (`sdd/mentiroso/tasks`) — UNLIKE
 * `truco-module/src/tournament.test.ts`'s own precedent, which sits at the
 * MODULE layer because dealing cards needs that module's own system-action
 * factory. Rolling dice needs no such factory: `mentiroso-engine` already
 * exports every reducer this driver calls directly (`applyOpeningDrawRoll`,
 * `applyRoundRoll`, `applyRaise`, `applyDoubt`, `resolveShowdown`,
 * `getOutcome`, `getViewFor`, `getLegalActions`), so driving a full match
 * needs no new dependency on `mentiroso-module` (L2) from this L1 package.
 *
 * SEED AND SAMPLE SIZE ARE FIXED BEFORE RUNNING, PER THE LAUNCH PROMPT'S OWN
 * INSTRUCTION — declared here, not tuned afterward:
 *   - Seat count: 2 (fewest decisions per match, fastest to converge — the
 *     same seat count `truco-module`'s own 1v1 tournament measures at; a
 *     starting point, not every registered seat count — see design's own
 *     Open Questions: "200 per pairing is a starting point to MEASURE, not
 *     a target to reach").
 *   - Sample size: 200 matches per pairing (design D7's own stated starting
 *     point), across THREE independent, non-overlapping seed ranges
 *     (1..200, 1001..1200, 5001..5200) so a single seed range cannot be
 *     mistaken for a real effect — the launch prompt's own "probá con
 *     varias semillas y reportá la dispersión."
 *   - Every pairing alternates which tier sits in seat 0 by seed parity,
 *     cancelling any seat/opener-order bias — the same cancellation
 *     `truco-module/src/tournament.test.ts` already applies.
 *
 * ============================================================================
 * THE FINDING (measured, not adjusted for): `hard > normal` and `hard > easy`
 * both hold overwhelmingly (100.0% and 99.3% aggregate, respectively, with
 * near-zero dispersion across all three seed ranges — see the exact counts
 * in each `it` below). But `normal > easy` — the ordering this task was
 * asked to confirm — DOES NOT HOLD. `easy` beats `normal` in 82.8% of
 * matches (497/600 aggregate), just as consistently across all three seed
 * ranges (497/600 is not a fluke of one range: 168/200, 163/200, 166/200).
 *
 * The true measured order is `hard > easy > normal`, not `hard > normal >
 * easy`. Per the launch prompt's own instruction ("si `hard` no le gana a
 * `normal`, lo reportás ... no ajustes constantes hasta que el número dé"),
 * this file asserts what was ACTUALLY measured, not what the difficulty
 * ladder's name implies. Re-sampling, reseeding, or hand-tuning
 * `normal.ts`/`easy.ts` (both already shipped, unmerged, in PRs #369/#370)
 * to force the "expected" order would be exactly the fabrication that
 * instruction forbids.
 *
 * WHY, ARGUED FROM THE CODE, NOT ONLY FROM THE NUMBERS: `normal.ts` (task
 * 4.2) picks its raise UNIFORMLY across the entire legal lattice once
 * continuing — including wild, deeply-improbable jumps clear across the
 * board. `easy.ts` (task 4.3) instead raises by the MINIMAL legal step 70%
 * of the time (`MINIMAL_RAISE_BIAS_RATE`), a habit that happens to be a far
 * SAFER one than a blind uniform pick, even though `easy` also adds noise to
 * its own doubt/continue gate. Over many rounds, `normal`'s uniform choice
 * regularly lands on a bid its honest-evaluating opponent correctly doubts
 * and wins; `easy`'s habitual minimal raises are far more often true, so
 * `easy` loses far fewer showdowns despite its noisier doubting. Neither
 * `normal.ts` nor `easy.ts` is touched by this unit — both were already
 * reviewed and shipped in prior work units; this file only measures and
 * reports what their already-shipped policies actually produce together.
 * ============================================================================
 */

const PLAYER_A = "player-a" as PlayerId;
const PLAYER_B = "player-b" as PlayerId;

function playerIdForSeat(seat: number): PlayerId {
  return seat === 0 ? PLAYER_A : PLAYER_B;
}

/** A hard cap that turns a driver bug into a loud failure instead of a
 * hang — the same role `truco-module/src/tournament.test.ts`'s own
 * `MAX_STEPS` plays. A 2-seat table starts at 10 total dice and loses
 * exactly one per round, so a real match never approaches this. */
const MAX_STEPS = 2000;

/** Plays one full deterministic 2-seat match to completion and returns the
 * winning seat's player id. Drives `mentiroso-engine`'s own reducers
 * directly — see this file's own top docblock for why no module-layer
 * system-action factory is needed here. */
function playMatch(rng: RandomSource, tierForSeat: readonly [MentirosoTier, MentirosoTier]): PlayerId {
  let state: MatchState = createMatch([PLAYER_A, PLAYER_B]);

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const outcome = getOutcome(state);
    if (outcome !== null) {
      if (outcome.winnerIds.length !== 1) throw new Error("round-robin: expected exactly one winner in a head-to-head match");
      return outcome.winnerIds[0]!;
    }

    switch (state.phase.kind) {
      case "opening-draw": {
        const faces = state.phase.contenders.map(() => drawDie(rng));
        const applied = applyOpeningDrawRoll(state, faces);
        if (!applied.ok) throw new Error(`round-robin: opening draw rejected: ${applied.violation.message}`);
        state = applied.state;
        continue;
      }
      case "awaiting-roll": {
        const diceBySeat = state.players.map((player) => player.dice.map(() => drawDie(rng)));
        const applied = applyRoundRoll(state, diceBySeat);
        if (!applied.ok) throw new Error(`round-robin: round roll rejected: ${applied.violation.message}`);
        state = applied.state;
        continue;
      }
      case "showdown": {
        const applied = resolveShowdown(state);
        if (!applied.ok) throw new Error(`round-robin: showdown resolve rejected: ${applied.violation.message}`);
        state = applied.state;
        continue;
      }
      case "bidding": {
        const turnSeat = state.phase.turnSeat;
        const playerId = playerIdForSeat(turnSeat);
        const legal = getLegalActions(state, playerId);
        if (legal.length === 0) throw new Error("round-robin: no legal actions for the seat in turn -- driver bug");
        const view = getViewFor(state, playerId);
        const tier = tierForSeat[turnSeat]!;
        const action = tier.chooseAction(view, legal as NonEmptyActions, 0);
        const applied = action.type === "raise" ? applyRaise(state, action) : applyDoubt(state, action);
        if (!applied.ok) throw new Error(`round-robin: bot chose an illegal action: ${applied.violation.message}`);
        state = applied.state;
        continue;
      }
    }
  }
  throw new Error(`round-robin: a match did not terminate within ${MAX_STEPS} steps -- likely a driver bug`);
}

type TierName = "easy" | "normal" | "hard";

function createTier(name: TierName, rng: RandomSource): MentirosoTier {
  switch (name) {
    case "easy":
      return createEasyBot(rng);
    case "normal":
      return createNormalBot(rng);
    case "hard":
      return createHardBot(rng);
  }
}

/** Runs one pairing over one seed range, alternating seat assignment by seed
 * parity (cancels seat/opener-order bias). Returns `left`'s win count out of
 * `seeds.length`. */
function runPairing(left: TierName, right: TierName, seeds: readonly number[]): { readonly leftWins: number; readonly total: number } {
  let leftWins = 0;
  for (const seed of seeds) {
    const rng = seededRng(seed);
    const leftIsSeatA = seed % 2 === 0;
    const tierForSeat: readonly [MentirosoTier, MentirosoTier] = leftIsSeatA
      ? [createTier(left, rng), createTier(right, rng)]
      : [createTier(right, rng), createTier(left, rng)];
    const winnerId = playMatch(rng, tierForSeat);
    const leftPlayerId = leftIsSeatA ? PLAYER_A : PLAYER_B;
    if (winnerId === leftPlayerId) leftWins += 1;
  }
  return { leftWins, total: seeds.length };
}

function seedRange(start: number, count: number): readonly number[] {
  return Array.from({ length: count }, (_unused, index) => start + index);
}

const SAMPLE_SIZE = 200;
const SEED_RANGES: readonly (readonly number[])[] = [seedRange(1, SAMPLE_SIZE), seedRange(1001, SAMPLE_SIZE), seedRange(5001, SAMPLE_SIZE)];

/** Every seed range's win rate for `left`, plus the aggregate — the
 * dispersion evidence the launch prompt asked for, kept as a permanent,
 * re-runnable check rather than a one-off exploratory print. */
function measureAcrossRanges(left: TierName, right: TierName): { readonly perRange: readonly number[]; readonly aggregate: number } {
  const results = SEED_RANGES.map((seeds) => runPairing(left, right, seeds));
  const totalWins = results.reduce((sum, r) => sum + r.leftWins, 0);
  const totalMatches = results.reduce((sum, r) => sum + r.total, 0);
  return { perRange: results.map((r) => r.leftWins / r.total), aggregate: totalWins / totalMatches };
}

describe("hard vs normal — seeded round-robin, 2 seats", () => {
  it("hard wins overwhelmingly, consistently across all three seed ranges (measured: 200/200, 200/200, 200/200 -- 600/600 aggregate)", () => {
    const { perRange, aggregate } = measureAcrossRanges("hard", "normal");
    for (const rate of perRange) expect(rate).toBeGreaterThan(0.9);
    expect(aggregate).toBeGreaterThan(0.9);
  });
});

describe("hard vs easy — seeded round-robin, 2 seats", () => {
  it("hard wins overwhelmingly, consistently across all three seed ranges (measured: 199/200, 199/200, 198/200 -- 596/600 aggregate)", () => {
    const { perRange, aggregate } = measureAcrossRanges("hard", "easy");
    for (const rate of perRange) expect(rate).toBeGreaterThan(0.9);
    expect(aggregate).toBeGreaterThan(0.9);
  });
});

describe("normal vs easy — seeded round-robin, 2 seats -- THE UNCOMFORTABLE FINDING", () => {
  it("does NOT show normal beating easy -- easy wins instead, consistently across all three seed ranges (measured: 168/200, 163/200, 166/200 easy wins -- 497/600 aggregate, 82.8%)", () => {
    // This is the opposite of what the "easy/normal/hard" naming implies.
    // See this file's own top docblock for the measured numbers and the
    // argument from `normal.ts`/`easy.ts`'s own already-shipped code for
    // WHY: a blind uniform raise pick (normal) loses to a 70%-of-the-time
    // minimal-raise habit (easy), even though easy also adds doubt-decision
    // noise normal does not have. Reported as measured -- not adjusted,
    // not re-seeded, not laundered by enlarging the sample.
    const { perRange, aggregate } = measureAcrossRanges("easy", "normal");
    for (const rate of perRange) expect(rate).toBeGreaterThan(0.65);
    expect(aggregate).toBeGreaterThan(0.65);
  });
});
