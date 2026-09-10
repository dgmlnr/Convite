import { describe, expect, it } from "vitest";
import type { Bid, DieFace, MatchState, Phase, Player, PlayerId } from "./state.js";
import { DIE_FACES } from "./dice.js";
import { ceilingFor, raisesFrom, totalDice } from "./bids.js";

/**
 * A seat holding `diceCount` dice, mirroring `seating.test.ts`'s own helper —
 * the face VALUE never matters for these fixtures, only the dice COUNT.
 */
function seatOf(seat: number, diceCount: number): Player {
  const dice: DieFace[] = Array.from({ length: diceCount }, () => 1 as DieFace);
  return { id: `p${String(seat)}` as PlayerId, seat, dice };
}

/**
 * Wraps `players` into a `MatchState` (work unit 2.1 reconciliation:
 * `totalDice`/`ceilingFor` now take `state: MatchState`, per
 * `sdd/mentiroso/design`'s own Interfaces section, exactly as `bids.ts`'s own
 * docblock said this unit would do). The `phase` here is a fixed, arbitrary
 * `bidding` state with no current bid — neither function reads `phase` at
 * all, so its exact shape is irrelevant to what these tests measure; a FIXED
 * phase across every fixture below means it can never coincidentally track
 * any of the seat/dice counts the tests DO vary.
 */
const ARBITRARY_PHASE: Phase = { kind: "bidding", turnSeat: 0, bid: null };
function matchOf(players: readonly Player[]): MatchState {
  return { players, phase: ARBITRARY_PHASE };
}

describe("totalDice (design D2)", () => {
  it("sums dice across every live seat at a fresh six-seat table", () => {
    const players = [seatOf(0, 5), seatOf(1, 5), seatOf(2, 5), seatOf(3, 5), seatOf(4, 5), seatOf(5, 5)];
    expect(totalDice(matchOf(players))).toBe(30);
  });

  it("counts an eliminated seat's empty dice array as zero, not as absent", () => {
    // Seats 1 and 3 already hold zero dice — a mid-match state, not a fresh
    // table, so the count must not assume every seat still has dice.
    const players = [seatOf(0, 3), seatOf(1, 0), seatOf(2, 2), seatOf(3, 0)];
    expect(totalDice(matchOf(players))).toBe(5);
  });
});

describe("ceilingFor (design D2 — the moving ceiling, derived every time, never stored)", () => {
  it("equals (30, 6) at a fresh six-seat table (six seats of five dice)", () => {
    const players = [seatOf(0, 5), seatOf(1, 5), seatOf(2, 5), seatOf(3, 5), seatOf(4, 5), seatOf(5, 5)];
    expect(ceilingFor(matchOf(players))).toEqual({ quantity: 30, face: 6 });
  });

  it("shrinks to (2, 6) at two seats holding one die each — the ruleset's own worked example", () => {
    // A THIRD, already-eliminated seat is included on purpose (design D1:
    // eliminated seats stay listed, never removed) so seat COUNT (3) and
    // dice COUNT (2) disagree — a mutation that counted seats instead of
    // dice would otherwise pass this fixture by coincidence with a plain
    // two-seat table, since 2 seats of 1 die each also happens to total 2.
    const players = [seatOf(0, 1), seatOf(1, 1), seatOf(2, 0)];
    expect(ceilingFor(matchOf(players))).toEqual({ quantity: 2, face: 6 });
  });

  it("tracks total dice EXACTLY as dice are surrendered, never a fixed constant", () => {
    // Deliberately not a monotonic "fewer seats" walk — mixed seat counts and
    // mixed per-seat dice, so a mutation clamping to any single hardcoded
    // number cannot coincidentally survive every case, only some.
    const cases: ReadonlyArray<{ readonly players: readonly Player[]; readonly expectedQuantity: number }> = [
      { players: [seatOf(0, 5), seatOf(1, 5), seatOf(2, 5), seatOf(3, 5), seatOf(4, 5), seatOf(5, 0)], expectedQuantity: 25 },
      { players: [seatOf(0, 4), seatOf(1, 3), seatOf(2, 0), seatOf(3, 0)], expectedQuantity: 7 },
      { players: [seatOf(0, 1), seatOf(1, 0)], expectedQuantity: 1 },
    ];
    for (const { players, expectedQuantity } of cases) {
      const state = matchOf(players);
      expect(ceilingFor(state).quantity).toBe(expectedQuantity);
      expect(ceilingFor(state).face).toBe(6);
    }
  });
});

describe("raisesFrom (design D2 — strictly greater over (quantity, face))", () => {
  // A ceiling generous enough not to constrain any of the ordering fixtures
  // below — these tests are about the ORDER relation, not the ceiling.
  const wideCeiling: Bid = { quantity: 30, face: 6 };

  it("THE FENCE: any strictly greater bid is legal — more quantity with ANY face, or same quantity with a strictly higher face", () => {
    const bid: Bid = { quantity: 4, face: 5 };
    const raises = raisesFrom(bid, wideCeiling);
    // More quantity, even with a LOWER face than the current bid's — proving
    // "more quantity" alone is sufficient and does not also require a higher
    // face (the two dimensions must not be conflated).
    expect(raises).toContainEqual({ quantity: 5, face: 1 });
    expect(raises).toContainEqual({ quantity: 5, face: 5 });
    expect(raises).toContainEqual({ quantity: 5, face: 6 });
    // Same quantity, strictly higher face — the OTHER independent way to raise.
    expect(raises).toContainEqual({ quantity: 4, face: 6 });
  });

  it("a non-increasing bid is rejected: neither the same bid nor a lower-quantity-higher-face bid is offered", () => {
    const bid: Bid = { quantity: 4, face: 5 };
    const raises = raisesFrom(bid, wideCeiling);
    expect(raises).not.toContainEqual({ quantity: 4, face: 5 }); // the same bid again
    expect(raises).not.toContainEqual({ quantity: 3, face: 6 }); // higher face, but LOWER quantity — still rejected
    expect(raises).not.toContainEqual({ quantity: 2, face: 6 });
  });

  it("same-quantity raises never include a face at or below the current bid's own face", () => {
    const bid: Bid = { quantity: 4, face: 3 };
    const raises = raisesFrom(bid, wideCeiling);
    const sameQuantityFaces = raises.filter((raise) => raise.quantity === 4).map((raise) => raise.face);
    expect(sameQuantityFaces).toEqual([4, 5, 6]);
  });

  it("THE FENCE: at the ceiling, there is no further raise at all — doubt is the only legal action", () => {
    const ceiling: Bid = { quantity: 12, face: 6 };
    expect(raisesFrom(ceiling, ceiling)).toEqual([]);
  });

  it("the opening bid (no current bid yet) offers every quantity from 1 through the ceiling, every face", () => {
    const ceiling: Bid = { quantity: 2, face: 6 };
    const raises = raisesFrom(null, ceiling);
    expect(raises).toHaveLength(2 * DIE_FACES.length);
    for (const quantity of [1, 2]) {
      for (const face of DIE_FACES) {
        expect(raises).toContainEqual({ quantity, face });
      }
    }
  });

  it("the opening bid never offers a quantity of zero", () => {
    const ceiling: Bid = { quantity: 3, face: 6 };
    const raises = raisesFrom(null, ceiling);
    expect(raises.some((raise) => raise.quantity === 0)).toBe(false);
    expect(Math.min(...raises.map((raise) => raise.quantity))).toBe(1);
  });

  it("never offers a quantity above the ceiling's, regardless of the current bid", () => {
    const ceiling: Bid = { quantity: 6, face: 6 };
    const bid: Bid = { quantity: 2, face: 3 };
    const raises = raisesFrom(bid, ceiling);
    for (const raise of raises) {
      expect(raise.quantity).toBeLessThanOrEqual(6);
    }
    expect(raises.some((raise) => raise.quantity > 6)).toBe(false);
  });
});
