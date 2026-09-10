import { describe, expect, it } from "vitest";
import type { DieFace, MatchState, Player, PlayerId } from "./state.js";
import { getOutcome } from "./outcome.js";

function seatOf(seat: number, diceCount: number): Player {
  const dice: DieFace[] = Array.from({ length: diceCount }, () => 1 as DieFace);
  return { id: `p${String(seat)}` as PlayerId, seat, dice };
}

/** `getOutcome` never reads `phase` (mentiroso-rules: "the sole seat left
 * holding dice MUST win the match" — a fact about `players` alone), so a
 * fixed, arbitrary phase across every fixture below can never coincidentally
 * track any of the seat counts these tests vary. */
const ARBITRARY_PHASE = { kind: "bidding", turnSeat: 0, bid: null } as const;
function matchOf(players: readonly Player[]): MatchState {
  return { players, phase: ARBITRARY_PHASE };
}

describe("getOutcome (mentiroso-rules: last seat standing wins)", () => {
  it("returns null while more than one seat still holds dice", () => {
    const players = [seatOf(0, 3), seatOf(1, 2), seatOf(2, 0)];
    expect(getOutcome(matchOf(players))).toBeNull();
  });

  it("returns null at a fresh table where every seat still holds dice", () => {
    const players = [0, 1, 2, 3].map((seat) => seatOf(seat, 5));
    expect(getOutcome(matchOf(players))).toBeNull();
  });

  it("THE FENCE: declares the sole seat holding dice the winner, by playerId, not by seat 0 or array position", () => {
    // Six seats, shuffled array order, and the survivor is seat 4 — neither
    // seat 0, nor array index 0 (which holds seat 5's own entry) — so a
    // mutation defaulting to either could not pass this fixture by
    // coincidence. Mirrors the ruleset's own worked example.
    const players = [seatOf(5, 0), seatOf(3, 0), seatOf(1, 0), seatOf(4, 2), seatOf(0, 0), seatOf(2, 0)];
    const outcome = getOutcome(matchOf(players));
    expect(outcome).not.toBeNull();
    expect(outcome!.winnerIds).toEqual(["p4"]);
  });

  it("returns null when every seat holds zero dice (an invariant violation that must never occur during normal play)", () => {
    const players = [seatOf(0, 0), seatOf(1, 0)];
    expect(getOutcome(matchOf(players))).toBeNull();
  });
});
