import { describe, expect, it } from "vitest";
import type { RandomSource } from "@hexdev/platform-contract";
import type { Bid, MentirosoAction, PlayerId, PlayerView } from "@hexdev/mentiroso-engine";
import { DIE_FACE_PROBABILITY } from "./probability.js";
import { chooseMentirosoAction, chooseUniformRaise } from "./normal.js";
import type { RaiseAction } from "./normal.js";
import { chooseEasyMentirosoAction, createEasyBot } from "./easy.js";
import type { NonEmptyActions } from "./tier.js";

/**
 * SDD `mentiroso`, work unit D3/task 4.3, design D7 ("not three algorithms —
 * ONE evaluation and TWO layers of modulation").
 *
 * `createEasyBot`'s tier reads ONLY `PlayerView` — never `MatchState` — the
 * same guarantee `normal.test.ts` already documents for `createNormalBot`.
 * These tests deliberately do NOT re-verify `probabilityBidHolds` itself
 * (the shared evaluation, `normal.test.ts`'s own job) or the ceiling gate
 * beyond one sanity check — this file's job is to prove the TWO modulation
 * layers `easy.ts` adds actually change the decision on a real fixture, not
 * merely that they exist.
 */

const SELF = "self-player" as PlayerId;
const RIVAL_A = "rival-a" as PlayerId;

/** A `RandomSource` fixed at one value — `[0, 1)` per its own contract. */
function fixedRng(value: number): RandomSource {
  return () => value;
}

/**
 * A `RandomSource` that plays back a scripted sequence of draws, one call
 * per array entry, and REPEATS the last entry once exhausted (rather than
 * throwing) — `easy`'s call count differs by branch (the minimal-raise bias
 * check short-circuits before the uniform fallback's own draw), so tests
 * that do not care about a later, unreachable draw are not forced to pad
 * the array with a value that is never consumed.
 */
function scriptedRng(values: readonly number[]): RandomSource {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value ?? 0;
  };
}

function doubt(playerId: PlayerId = SELF): MentirosoAction {
  return { type: "doubt", playerId };
}

function raise(bid: Bid, playerId: PlayerId = SELF): MentirosoAction {
  return { type: "raise", playerId, bid };
}

describe("createEasyBot -- forced doubt at the ceiling (mentiroso-rules R-CEILING), through the SHARED core", () => {
  it("doubts when doubt is the only legal action, across every rng draw -- the shared ceiling gate is reused, not re-implemented", () => {
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [6, 6] },
      rivals: [{ seat: 1, playerId: RIVAL_A, diceCount: 0 }],
      phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 2, face: 6 } },
    };
    const legalActions: NonEmptyActions = [doubt()];
    for (const value of [0, 0.001, 0.5, 0.999]) {
      expect(createEasyBot(fixedRng(value)).chooseAction(view, legalActions, 0)).toEqual(doubt());
    }
  });
});

describe("layer 1 -- rng-driven noise on the honest estimate genuinely changes the doubt/raise decision", () => {
  // Self holds no dice matching the claimed face, and the bid's quantity
  // (20) exceeds the unseen dice (5), so `atLeast` returns EXACTLY 0
  // (k > n, `probability.ts`'s own short-circuit) -- the honest estimate is
  // 0, not merely small.
  const view: PlayerView = {
    self: { playerId: SELF, seat: 0, dice: [1, 2, 3] },
    rivals: [{ seat: 1, playerId: RIVAL_A, diceCount: 5 }],
    phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 20, face: 6 } },
  };
  const onlyRaise = raise({ quantity: 21, face: 1 });
  const legalActions: NonEmptyActions = [doubt(), onlyRaise];

  it("normal doubts unconditionally at estimate = 0, for any coin-flip draw (the baseline this test contrasts against)", () => {
    expect(chooseMentirosoAction(view, legalActions, DIE_FACE_PROBABILITY, fixedRng(0.1))).toEqual(doubt());
  });

  it("the SAME position and the SAME coin-flip draw (0.1) flips to raise once noise pushes the estimate above it", () => {
    // Draw 1 (noise) = 1 -> jitter = (1 - 0.5) * 2 * 0.3 = 0.3 -> estimate 0.3.
    // Draw 2 (coin flip) = 0.1 -> 0.1 >= 0.3 is false -> continues (raises).
    // Draw 3 (minimal-raise bias check, repeats 0.1) -> 0.1 < 0.7 -> raises[0].
    const rng = scriptedRng([1, 0.1]);
    expect(chooseEasyMentirosoAction(view, legalActions, DIE_FACE_PROBABILITY, rng)).toBe(onlyRaise);
  });

  it("a midpoint noise draw (0.5) contributes zero jitter and reduces to the SAME answer as normal -- proves it is the same evaluation, not a different one", () => {
    const rng = scriptedRng([0.5, 0.1]);
    expect(chooseEasyMentirosoAction(view, legalActions, DIE_FACE_PROBABILITY, rng)).toEqual(doubt());
  });
});

describe("layer 1 -- noise stays semantically sound at both extremes, with no clamp (see easy.ts's own docblock for why none is needed)", () => {
  it("noise pushing an already-zero estimate further negative still always doubts, for every coin-flip draw", () => {
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [1, 2, 3] },
      rivals: [{ seat: 1, playerId: RIVAL_A, diceCount: 5 }],
      phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 20, face: 6 } },
    };
    const legalActions: NonEmptyActions = [doubt(), raise({ quantity: 21, face: 1 })];
    for (const coinFlip of [0, 0.5, 0.999]) {
      // Draw 1 (noise) = 0 -> jitter = (0 - 0.5) * 2 * 0.3 = -0.3 -> estimate -0.3.
      const rng = scriptedRng([0, coinFlip]);
      expect(chooseEasyMentirosoAction(view, legalActions, DIE_FACE_PROBABILITY, rng)).toEqual(doubt());
    }
  });

  it("noise pushing an already-certain estimate further past 1 never doubts, for every coin-flip draw", () => {
    // Self already holds enough matching dice that k <= 0 -- `atLeast`
    // returns exactly 1 (certain), the mirror-image extreme of the test
    // above.
    const view: PlayerView = {
      self: { playerId: SELF, seat: 0, dice: [6, 6, 6, 6, 6] },
      rivals: [{ seat: 1, playerId: RIVAL_A, diceCount: 3 }],
      phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 1, face: 6 } },
    };
    const onlyRaise = raise({ quantity: 2, face: 1 });
    const legalActions: NonEmptyActions = [doubt(), onlyRaise];
    for (const coinFlip of [0, 0.5, 0.999]) {
      // Draw 1 (noise) = 1 -> jitter = +0.3 -> estimate 1.3.
      const rng = scriptedRng([1, coinFlip]);
      expect(chooseEasyMentirosoAction(view, legalActions, DIE_FACE_PROBABILITY, rng)).toBe(onlyRaise);
    }
  });
});

describe("layer 2 -- bias toward the minimal raise, once continuing (bid === null, so no coin flip is involved at all)", () => {
  const view: PlayerView = {
    self: { playerId: SELF, seat: 0, dice: [1, 2, 3, 4, 5] },
    rivals: [{ seat: 1, playerId: RIVAL_A, diceCount: 5 }],
    phase: { kind: "bidding", turnSeat: 0, bid: null },
  };
  const minimalRaise = raise({ quantity: 1, face: 1 });
  const middleRaise = raise({ quantity: 1, face: 2 });
  const lastRaise = raise({ quantity: 1, face: 3 });
  const legalActions: NonEmptyActions = [minimalRaise, middleRaise, lastRaise];

  it("picks the minimal raise when the bias check succeeds, even at a draw where a plain uniform pick over the SAME list would not", () => {
    // 0.5 < 0.7 (the bias rate) succeeds -> minimalRaise, by the bias branch.
    // Deliberately NOT 0 or another value that would land on index 0 under
    // uniform selection too (AGENTS.md's own "family of traps" -- a draw
    // where two mechanisms coincide measures nothing): a plain uniform pick
    // at this SAME 0.5 draw would select floor(0.5 * 3) = index 1
    // (middleRaise), proven directly below through `normal`'s own exported
    // helper, never re-implemented here.
    expect(chooseEasyMentirosoAction(view, legalActions, DIE_FACE_PROBABILITY, fixedRng(0.5))).toBe(minimalRaise);
    expect(chooseUniformRaise([minimalRaise, middleRaise, lastRaise] as readonly RaiseAction[], fixedRng(0.5))).toBe(middleRaise);
  });

  it("falls back to normal's own uniform pick -- not a second implementation -- when the bias check fails (negative control for the branch above)", () => {
    // A single constant draw (0.9) drives BOTH the failed bias check
    // (0.9 < 0.7 is false) and the subsequent uniform pick, so this result
    // must equal `chooseUniformRaise` over the identical list at the same
    // draw -- proving the fallback reuses that function rather than
    // reimplementing "pick uniformly" a second time.
    const viaEasy = chooseEasyMentirosoAction(view, legalActions, DIE_FACE_PROBABILITY, fixedRng(0.9));
    const viaNormalsUniform = chooseUniformRaise([minimalRaise, middleRaise, lastRaise] as readonly RaiseAction[], fixedRng(0.9));
    expect(viaEasy).toBe(lastRaise);
    expect(viaEasy).toBe(viaNormalsUniform);
  });

  it("the bias check and the uniform fallback are two INDEPENDENT draws, not the same value reused twice", () => {
    // Draw 1 (bias check) = 0.8 -> 0.8 < 0.7 is false -> falls through.
    // Draw 2 (uniform pick) = 0.1 -> floor(0.1 * 3) = 0 -> minimalRaise.
    // If the implementation reused draw 1 for the fallback instead of
    // drawing again, this would incorrectly select via 0.8, not 0.1.
    const rng = scriptedRng([0.8, 0.1]);
    expect(chooseEasyMentirosoAction(view, legalActions, DIE_FACE_PROBABILITY, rng)).toBe(minimalRaise);
  });
});

describe("the p = 1/6-vs-1/3 fence still applies through easy's own modulation (design D7's trap, one layer up)", () => {
  // Same fixture shape `normal.test.ts` uses for its own decision-level
  // fence: k = 4 (no own matches), n = 15 unseen. atLeast(4,15,1/6) ~= 0.2315
  // (doubts), atLeast(4,15,1/3) ~= 0.7908 (raises) at a fixed 0.5 coin flip.
  // Noise draw pinned to 0.5 (zero jitter) so ONLY the p parameter drives the
  // difference between the two assertions below, never the noise layer.
  const view: PlayerView = {
    self: { playerId: SELF, seat: 0, dice: [1, 2, 3, 5, 6] },
    rivals: [
      { seat: 1, playerId: RIVAL_A, diceCount: 5 },
      { seat: 2, playerId: "rival-b" as PlayerId, diceCount: 5 },
      { seat: 3, playerId: "rival-c" as PlayerId, diceCount: 5 },
    ],
    phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 4, face: 4 } },
  };
  const onlyRaise = raise({ quantity: 5, face: 1 });
  const legalActions: NonEmptyActions = [doubt(), onlyRaise];

  it("doubts at the real, no-wildcard p = 1/6, with zero jitter", () => {
    const rng = scriptedRng([0.5, 0.5]);
    expect(chooseEasyMentirosoAction(view, legalActions, 1 / 6, rng)).toEqual(doubt());
  });

  it("raises at the wildcard-tainted p = 1/3 -- the SAME position, the SAME draws", () => {
    const rng = scriptedRng([0.5, 0.5]);
    expect(chooseEasyMentirosoAction(view, legalActions, 1 / 3, rng)).toBe(onlyRaise);
  });

  it("createEasyBot's production wiring reaches the real p = 1/6 answer through DIE_FACE_PROBABILITY, not a re-hardcoded value", () => {
    expect(DIE_FACE_PROBABILITY).toBe(1 / 6);
    const rng = scriptedRng([0.5, 0.5]);
    expect(createEasyBot(rng).chooseAction(view, legalActions, 0)).toEqual(doubt());
  });
});
