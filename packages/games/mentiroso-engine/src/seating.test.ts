import { describe, expect, it } from "vitest";
import type { DieFace, Player, PlayerId } from "./state.js";
import { nextActiveSeat } from "./seating.js";

/**
 * A seat holding `diceCount` dice. The face VALUE never matters here — only
 * whether the array is empty, per design D1's `dice.length === 0`
 * elimination rule — so every die is filled with the same arbitrary face.
 */
function seatOf(seat: number, diceCount: number): Player {
  const dice: DieFace[] = Array.from({ length: diceCount }, () => 1 as DieFace);
  return { id: `p${String(seat)}` as PlayerId, seat, dice };
}

/**
 * `sdd/mentiroso/design` D1's own fence, and AGENTS.md's own lesson
 * ("fixtures donde las lecturas discrepen" — the Generala tie-break that
 * shipped unmeasured because every fixture let "highest" and "last" agree):
 * every fixture below is built so plain "next seat" and true "next ACTIVE
 * seat" DISAGREE. A fixture where they always coincide would exercise
 * `(fromSeat + 1) % seatCount` and nothing about the skip at all.
 */
describe("nextActiveSeat (design D1)", () => {
  it("THE FENCE: skips a single eliminated seat between fromSeat and the true next active seat", () => {
    // seat 1 is eliminated. A naive `(fromSeat + 1) % seatCount` reads 1 —
    // and that reading is wrong.
    const players = [seatOf(0, 3), seatOf(1, 0), seatOf(2, 2), seatOf(3, 1)];
    const naiveNextSeat = (0 + 1) % players.length;
    expect(naiveNextSeat).toBe(1); // the naive reading, proven wrong below
    expect(nextActiveSeat(players, 0)).toBe(2);
  });

  it("wraps past seat 0 when seat 0 is eliminated: from the last seat, the naive reading lands on 0 and is wrong", () => {
    const players = [seatOf(0, 0), seatOf(1, 2), seatOf(2, 1), seatOf(3, 1)];
    const naiveNextSeat = (3 + 1) % players.length;
    expect(naiveNextSeat).toBe(0); // the naive reading — seat 0 is eliminated
    expect(nextActiveSeat(players, 3)).toBe(1);
  });

  it("seat 0 itself eliminated as the STARTING seat: still walks forward correctly, skipping itself and the next eliminated seat too", () => {
    const players = [seatOf(0, 0), seatOf(1, 0), seatOf(2, 3), seatOf(3, 1)];
    expect(nextActiveSeat(players, 0)).toBe(2);
  });

  it("returns the sole live seat when invoked from any OTHER seat", () => {
    const players = [seatOf(0, 0), seatOf(1, 0), seatOf(2, 5), seatOf(3, 0)];
    expect(nextActiveSeat(players, 0)).toBe(2);
    expect(nextActiveSeat(players, 1)).toBe(2);
    expect(nextActiveSeat(players, 3)).toBe(2);
  });

  it("returns the sole live seat when invoked from ITSELF too — closed by the loop bound, not a separate check", () => {
    const players = [seatOf(0, 0), seatOf(1, 0), seatOf(2, 5), seatOf(3, 0)];
    expect(nextActiveSeat(players, 2)).toBe(2);
  });

  it("visits at most seatCount seats before resolving, from every possible starting seat, in a full circuit around the only live seat", () => {
    // The lone survivor sits at seat 5, deliberately OUTSIDE any smaller
    // hardcoded bound (4, the largest seat count anywhere else in this repo,
    // per this unit's own six-seat-probe docblock) — a seatCount silently
    // capped below 6 would never reach seat 5 at all and this would red,
    // proving the bound is read off `players.length`, not a fixed number.
    const players = [seatOf(0, 0), seatOf(1, 0), seatOf(2, 0), seatOf(3, 0), seatOf(4, 0), seatOf(5, 2)];
    for (let fromSeat = 0; fromSeat < players.length; fromSeat += 1) {
      expect(nextActiveSeat(players, fromSeat)).toBe(5);
    }
  });

  it("throws naming the invariant when every seat holds zero dice", () => {
    const players = [seatOf(0, 0), seatOf(1, 0), seatOf(2, 0)];
    expect(() => nextActiveSeat(players, 0)).toThrow(/no seat holds any dice/);
  });

  it("looks players up by their `.seat` field, never by array index — the array need not be seat-ordered", () => {
    // Deliberately shuffled AND chosen so an index-based lookup reads a
    // DIFFERENT alive/dead verdict than the real seat does at every position
    // this walk visits — not merely shuffled, since a shuffle that still
    // coincidentally agrees on alive/dead at each visited position would
    // return the right seat number for the wrong reason. At array position 1
    // sits seat 2 (dead); the REAL seat 1 sits at position 3 (alive). An
    // index-based read of position 1 sees "dead" and skips to position 2
    // (seat 0, alive) instead, returning 2 where the correct answer is 1.
    const shuffled = [seatOf(3, 1), seatOf(2, 0), seatOf(0, 3), seatOf(1, 2)];
    expect(nextActiveSeat(shuffled, 0)).toBe(1);
  });
});
