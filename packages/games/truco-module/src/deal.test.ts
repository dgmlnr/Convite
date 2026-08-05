import { describe, expect, it } from "vitest";
import type { PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import { trucoModule } from "./index.js";
import { SYSTEM_ACTOR_ID, requestSystemAction } from "./deal.js";

const playerAId = "player-a" as PlayerId;
const playerBId = "player-b" as PlayerId;
const seats: readonly SeatAssignment[] = [
  { seat: 0, playerId: playerAId },
  { seat: 1, playerId: playerBId },
];
const config = { pointsToWin: 15 as const };

/** Deterministic stand-in for a CSPRNG: cycles through fixed values so the
 * shuffle is reproducible in a test, never claiming to be cryptographic. */
function fixedRng(values: readonly number[]) {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("requestSystemAction (truco-module's deal factory — never a platform-contract port member)", () => {
  it("deals a fresh hand when the match has no hand yet", () => {
    const state = trucoModule.createMatch(config, seats);
    const action = requestSystemAction(state, fixedRng([0.1, 0.5, 0.9, 0.2]));
    expect(action?.type).toBe("start-hand");
    expect(action?.playerId).toBe(SYSTEM_ACTOR_ID);
  });

  it("deals exactly 3 distinct cards to each of the 2 seats, drawn from the real 40-card deck", () => {
    const state = trucoModule.createMatch(config, seats);
    const action = requestSystemAction(state, fixedRng([0.31, 0.62, 0.05, 0.77, 0.44, 0.9, 0.13]));
    if (action === null || action.type !== "start-hand") throw new Error("expected a start-hand action");
    expect(action.deal).toHaveLength(2);
    expect(action.deal[0]).toHaveLength(3);
    expect(action.deal[1]).toHaveLength(3);
    const allCards = [...action.deal[0]!, ...action.deal[1]!];
    const uniqueIds = new Set(allCards.map((card) => `${card.rank}-${card.suit}`));
    expect(uniqueIds.size).toBe(6);
  });

  it("returns null while a hand is already in progress — the room must not re-deal mid-hand", () => {
    const created = trucoModule.createMatch(config, seats);
    const dealt = trucoModule.applyAction(created, requestSystemAction(created, fixedRng([0.1, 0.2, 0.3, 0.4]))!);
    if (!dealt.ok) throw new Error("fixture setup: dealing failed");
    expect(requestSystemAction(dealt.state, fixedRng([0.5]))).toBeNull();
  });

  it("returns null once the match already has a winner — no further hand is dealt", () => {
    const state = trucoModule.createMatch(config, seats);
    const wonState = { ...state, teams: state.teams.map((team) => ({ ...team, score: config.pointsToWin })) };
    expect(requestSystemAction(wonState, fixedRng([0.5]))).toBeNull();
  });
});
