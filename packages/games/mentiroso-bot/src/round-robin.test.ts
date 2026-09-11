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
 * TASK 4.6 UPDATE — THE MEASUREMENT WAS RE-RUN AFTER `normal.ts` CHANGED.
 *
 * D4 (task 4.4, see the archived numbers this file's own git history still
 * carries) measured `hard > easy > normal` — `normal`'s raise choice back
 * then was a blind UNIFORM pick, and lost to `easy`'s 70%-of-the-time
 * minimal-raise habit 82.8% of the time. The product owner asked for a
 * BETTER `normal` (not merely one that wins) rather than renaming the tiers.
 * `normal.ts` (task 4.6) now scores every legal raise by
 * `probabilityBidHolds` and takes the highest-scoring one — a REASONED
 * policy, not a copy of `easy`'s bias (see `normal.ts`'s own docblock and
 * `normal.test.ts`'s dedicated fixture proving the two disagree). SAME seed
 * ranges, SAME sample size, SAME driver as D4 — re-run, not re-designed.
 *
 * THE NEW FINDING (measured, not adjusted for; task 4.6):
 *
 *   | pairing        | per range           | aggregate    |
 *   |----------------|----------------------|--------------|
 *   | hard vs normal | 105/200, 110/200, 107/200 | 322/600 (53.7%) |
 *   | hard vs easy   | 199/200, 199/200, 198/200 | 596/600 (99.3%) — UNCHANGED |
 *   | normal vs easy | 198/200, 199/200, 199/200 | 596/600 (99.3%) |
 *
 * `normal > easy` NOW HOLDS, overwhelmingly — a complete reversal from D4's
 * 82.8%-for-easy finding, not a marginal correction. `hard > easy` is
 * BYTE-IDENTICAL to D4 (596/600, same per-range split): `easy.ts`/`hard.ts`
 * are untouched by this unit, exactly as scoped.
 *
 * BUT `hard > normal` NEARLY COLLAPSED: from 600/600 (100.0%) down to
 * 322/600 (53.7%), barely above a coin flip. THIS IS A REAL FINDING, ARGUED
 * FROM THE CODE, NOT A REGRESSION IN THIS UNIT'S OWN WORK: `hard.ts` (task
 * 4.4) and `normal.ts` (task 4.6) now both maximize essentially the SAME
 * quantity — "how likely is this raise to hold" — over the SAME legal
 * lattice, just through two different mechanisms: `normal` computes it in
 * exact closed form (`probabilityBidHolds`, task 4.1's own binomial tail);
 * `hard` estimates it via `DETERMINIZATION_SAMPLES = 200` Monte-Carlo boards
 * (`hard.ts`'s own `selectSafestRaise`). Two estimators of the same
 * quantity converging on similar decisions is not a coincidence to explain
 * away — the sampled estimate has no reason to systematically disagree with
 * the exact one at 200 samples, which is exactly what a near-50% result
 * against an otherwise-identical evaluation core predicts. `hard`'s
 * remaining ~3.7-point edge is consistent with the SAMPLING NOISE its
 * Monte-Carlo estimate carries and the exact one does not.
 *
 * NOT THIS UNIT'S JOB TO FIX: task 4.6 asked for a BETTER `normal` and to
 * report what re-running THE MEASUREMENT produces, not to preserve `hard`'s
 * prior margin over `normal`. `hard.ts` is unmodified. Whether `hard` should
 * gain its own further differentiation (a genuine lookahead, multiple
 * plies, opponent modeling — none of which any source names for this game,
 * `sdd/mentiroso/research` C8/C14) is a decision left open for the product
 * owner, the same way task 4.4 left "does `hard>normal>easy` hold" open for
 * this task to pick up.
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

describe("hard vs normal — seeded round-robin, 2 seats (task 4.6: RE-MEASURED after normal's raise policy changed)", () => {
  it("hard's edge has nearly collapsed to a coin flip -- normal's new closed-form raise choice converges toward hard's Monte-Carlo one (measured: 105/200, 110/200, 107/200 -- 322/600 aggregate, 53.7%)", () => {
    // See this file's own top docblock ("TASK 4.6 UPDATE") for the full
    // argument: both tiers now maximize essentially the SAME quantity over
    // the SAME lattice, through two different mechanisms (exact vs
    // sampled). Bounded on BOTH sides, not just a one-sided floor, so a
    // future drift back toward D4's old 100% (hard dominant again) or an
    // unexpected reversal (normal dominant) is caught, not silently
    // absorbed.
    const { perRange, aggregate } = measureAcrossRanges("hard", "normal");
    for (const rate of perRange) {
      expect(rate).toBeGreaterThan(0.5);
      expect(rate).toBeLessThan(0.65);
    }
    expect(aggregate).toBeGreaterThan(0.5);
    expect(aggregate).toBeLessThan(0.65);
  });
});

describe("hard vs easy — seeded round-robin, 2 seats", () => {
  it("hard wins overwhelmingly, consistently across all three seed ranges -- UNCHANGED from D4, since easy.ts and hard.ts are untouched by task 4.6 (measured: 199/200, 199/200, 198/200 -- 596/600 aggregate)", () => {
    const { perRange, aggregate } = measureAcrossRanges("hard", "easy");
    for (const rate of perRange) expect(rate).toBeGreaterThan(0.9);
    expect(aggregate).toBeGreaterThan(0.9);
  });
});

describe("normal vs easy — seeded round-robin, 2 seats -- TASK 4.6: THE LADDER NOW HOLDS HERE", () => {
  it("normal now beats easy overwhelmingly -- a complete reversal from D4's 82.8%-for-easy finding, not a marginal correction (measured: 198/200, 199/200, 199/200 -- 596/600 aggregate, 99.3%)", () => {
    // D4 (task 4.4) measured EASY beating a uniform-raise `normal` 82.8% of
    // the time. `normal.ts`'s new, reasoned raise policy (task 4.6)
    // reverses this completely. Reported as measured -- same seed ranges,
    // same sample size, same driver as D4; no re-seeding, no re-tuning.
    const { perRange, aggregate } = measureAcrossRanges("normal", "easy");
    for (const rate of perRange) expect(rate).toBeGreaterThan(0.9);
    expect(aggregate).toBeGreaterThan(0.9);
  });
});
