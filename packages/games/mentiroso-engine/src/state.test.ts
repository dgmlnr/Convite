import { describe, expect, it } from "vitest";
import type { PlayerId } from "./state.js";
import { MAX_SEAT_COUNT, MIN_SEAT_COUNT, STARTING_DICE_PER_SEAT, createMatch } from "./state.js";

/** `playerId`s in seat order — the VALUES never matter to `createMatch`,
 * only their count and order, so a plain `player-{n}` scheme is enough. */
function idsFor(seatCount: number): PlayerId[] {
  return Array.from({ length: seatCount }, (_, seat) => `player-${String(seat)}` as PlayerId);
}

/**
 * `sdd/mentiroso/design`'s own Interfaces section never fixed `createMatch`'s
 * signature (unlike `nextActiveSeat`/`ceilingFor`/`raisesFrom`, which it
 * names exactly) — work unit 2.1's own job is to complete `state.ts`, and
 * this is that completion. `createMatch(playerIds)` mirrors
 * `generala-engine/src/state.ts`'s own `createMatch(playerIds)` exactly
 * (see this file's own docblock for why NOT a bare `seatCount`).
 */
describe("createMatch (work unit 2.1)", () => {
  it("THE FENCE: rejects a table below the ruleset's own minimum of 2 seats", () => {
    expect(() => createMatch(idsFor(1))).toThrow(/2/);
  });

  it("THE FENCE: rejects a table above the ruleset's own maximum of 6 seats", () => {
    expect(() => createMatch(idsFor(7))).toThrow(/6/);
  });

  it("accepts both boundaries of the ruleset's own range, 2 and 6 seats", () => {
    expect(() => createMatch(idsFor(MIN_SEAT_COUNT))).not.toThrow();
    expect(() => createMatch(idsFor(MAX_SEAT_COUNT))).not.toThrow();
  });

  it("assigns seat numbers 0..N-1 in the input order, never rearranged", () => {
    const ids = ["carol", "alice", "bob"] as PlayerId[];
    const match = createMatch(ids);
    expect(match.players.map((player) => player.seat)).toEqual([0, 1, 2]);
    expect(match.players.map((player) => player.id)).toEqual(ids);
  });

  it("seats every player with exactly STARTING_DICE_PER_SEAT dice, at a seat count that does NOT itself equal that count", () => {
    // 3 seats, deliberately not 5 — a mutation that read the SEAT count
    // instead of the dice-per-seat constant would coincidentally pass at a
    // 5-seat table; 3 seats forces the two counts apart.
    expect(STARTING_DICE_PER_SEAT).toBe(5);
    const match = createMatch(idsFor(3));
    for (const player of match.players) {
      expect(player.dice).toHaveLength(5);
    }
  });

  it("opens in the opening-draw phase with no faces drawn yet", () => {
    const match = createMatch(idsFor(4));
    expect(match.phase.kind).toBe("opening-draw");
    if (match.phase.kind !== "opening-draw") throw new Error("unreachable — asserted above");
    expect(match.phase.lastFaces).toEqual([]);
  });

  it("THE FENCE: every seat is a contender at the start, scaled to the ACTUAL seat count, never a hardcoded list", () => {
    // Skips 5 seats on purpose: STARTING_DICE_PER_SEAT is also 5, and a
    // mutation reading the wrong constant instead of the real seat count
    // could coincidentally satisfy a 5-seat fixture. 2, 3, 4, and 6 keep
    // "how many seats" and "how many dice per seat" from ever agreeing here.
    for (const seatCount of [2, 3, 4, 6]) {
      const match = createMatch(idsFor(seatCount));
      expect(match.players).toHaveLength(seatCount);
      if (match.phase.kind !== "opening-draw") throw new Error("unreachable — asserted above");
      expect(match.phase.contenders).toEqual(Array.from({ length: seatCount }, (_, seat) => seat));
    }
  });
});
