import { describe, expect, it } from "vitest";
import type { Bid, DieFace, MatchState, Phase, Player, PlayerId } from "./state.js";
import { ceilingFor } from "./bids.js";
import { getLegalActions } from "./legal-actions.js";

/**
 * A seat holding `diceCount` dice, mirroring `bids.test.ts`'s own `seatOf` —
 * the face VALUE never matters for these fixtures, only the dice COUNT.
 */
function seatOf(seat: number, diceCount: number): Player {
  const dice: DieFace[] = Array.from({ length: diceCount }, () => 1 as DieFace);
  return { id: `p${String(seat)}` as PlayerId, seat, dice };
}

/** Wraps `players` into a `MatchState` sitting in the `bidding` phase with the
 * given `turnSeat`/`bid` — the only phase `getLegalActions` offers anything
 * for (work unit B2). */
function biddingMatch(players: readonly Player[], turnSeat: number, bid: Bid | null): MatchState {
  const phase: Phase = { kind: "bidding", turnSeat, bid };
  return { players, phase };
}

describe("getLegalActions — THE FENCE: only the seat in turn has actions (mentiroso-rules)", () => {
  it("every seat other than turnSeat gets none, and the seat in turn gets some", () => {
    // Array order deliberately does NOT match seat order (seat 2 sits at
    // array index 0) — the exact "mixed array, looked up by index instead of
    // by `.seat`/`.id`" trap this chain has already hit three times. A lookup
    // keyed off array position instead of `.id` would misidentify who is
    // actually in turn against this fixture.
    const players = [seatOf(2, 5), seatOf(0, 5), seatOf(3, 5), seatOf(1, 5)];
    const state = biddingMatch(players, 2, { quantity: 3, face: 4 });
    // Three OTHER seats checked, not just one — an off-by-one turn gate
    // (e.g. "seat after turnSeat" instead of "seat === turnSeat") would still
    // pass a check against a single wrong seat.
    for (const seat of [0, 1, 3]) {
      const player = players.find((candidate) => candidate.seat === seat)!;
      expect(getLegalActions(state, player.id)).toEqual([]);
    }
    const turnPlayer = players.find((candidate) => candidate.seat === 2)!;
    expect(getLegalActions(state, turnPlayer.id).length).toBeGreaterThan(0);
  });

  it("a playerId seated nowhere at this table gets none", () => {
    const players = [seatOf(0, 5), seatOf(1, 5)];
    const state = biddingMatch(players, 0, null);
    expect(getLegalActions(state, "ghost" as PlayerId)).toEqual([]);
  });
});

describe("getLegalActions — THE FENCE: the opening of a round has no doubt (mentiroso-rules: no bid, nothing to doubt)", () => {
  it("with no current bid, every offered action is a raise, never doubt", () => {
    const players = [seatOf(0, 2), seatOf(1, 2)];
    const state = biddingMatch(players, 0, null);
    const actions = getLegalActions(state, players[0]!.id);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((action) => action.type === "raise")).toBe(true);
  });
});

describe("getLegalActions — THE FENCE: at the ceiling, doubt is the only legal action (mentiroso-rules)", () => {
  it("total dice (5) != seat count (4) != face count (6), and the ceiling still forces exactly one action", () => {
    // Two of the four seats are already eliminated (design D1: eliminated
    // seats stay listed, never removed) — the same trap this chain's own
    // three prior near-misses share: a fixture where two readings coincide.
    // Seat count is 4, total dice is 2 + 3 = 5: neither equals the other, and
    // neither equals 6 (the face count), so a mutation that quietly counted
    // seats, or that quietly hardcoded 6, cannot pass this fixture by luck.
    const players = [seatOf(0, 2), seatOf(1, 0), seatOf(2, 3), seatOf(3, 0)];
    const state = biddingMatch(players, 2, { quantity: 5, face: 6 });
    expect(ceilingFor(state)).toEqual({ quantity: 5, face: 6 }); // sanity: this bid really is the ceiling
    expect(getLegalActions(state, players[2]!.id)).toEqual([{ type: "doubt", playerId: players[2]!.id }]);
  });
});

describe("getLegalActions — mid-lattice: every raise plus doubt, at a count that never coincides with seat count or face count", () => {
  it("2 seats (seat count 2), 10 total dice (ceiling quantity 10) — 15 raises + 1 doubt, never truncated to 2 or 6", () => {
    const players = [seatOf(0, 5), seatOf(1, 5)];
    const bid: Bid = { quantity: 8, face: 3 };
    const state = biddingMatch(players, 0, bid);
    expect(ceilingFor(state)).toEqual({ quantity: 10, face: 6 }); // sanity check on the fixture itself

    const actions = getLegalActions(state, players[0]!.id);
    const raiseActions = actions.filter((action) => action.type === "raise");
    const doubtActions = actions.filter((action) => action.type === "doubt");

    expect(raiseActions).toHaveLength(15); // quantity 8: faces 4,5,6 (3); quantity 9 and 10: all 6 faces each (12)
    expect(doubtActions).toHaveLength(1);
    expect(actions).toHaveLength(16);
    expect(actions[actions.length - 1]).toEqual({ type: "doubt", playerId: players[0]!.id });
  });
});

describe("getLegalActions — bounded even at the largest table (design D2: <=180 at a fresh six-seat table)", () => {
  it("a fresh six-seat table opening its very first bid offers exactly 180 raises", () => {
    const players = [0, 1, 2, 3, 4, 5].map((seat) => seatOf(seat, 5));
    const state = biddingMatch(players, 0, null);
    // 30 total dice * 6 faces = 180 — the exact ceiling design names as the
    // largest this function ever grows to.
    expect(getLegalActions(state, players[0]!.id)).toHaveLength(180);
  });
});

describe("getLegalActions — only the bidding phase offers player actions", () => {
  it("opening-draw, awaiting-roll, and showdown all offer nothing to any seat", () => {
    const players = [seatOf(0, 5), seatOf(1, 5)];
    const phases: readonly Phase[] = [
      { kind: "opening-draw", contenders: [0, 1], lastFaces: [] },
      { kind: "awaiting-roll", openerSeat: 0 },
      { kind: "showdown", bid: { quantity: 2, face: 6 }, doubterSeat: 1, matched: 2, loserSeat: 0 },
    ];
    for (const phase of phases) {
      const state: MatchState = { players, phase };
      for (const player of players) {
        expect(getLegalActions(state, player.id)).toEqual([]);
      }
    }
  });
});
