import { describe, expect, it } from "vitest";
import type { TeamId } from "@hexdev/truco-engine";
import { describeTrickOutcome } from "./trick-feedback.js";

const MY_TEAM = "player-a:team" as TeamId;
const OPPONENT_TEAM = "player-b:team" as TeamId;

describe("describeTrickOutcome (spec: obvious ... who won the trick — derived from HandView.trickOutcomes, never re-judged)", () => {
  it("announces a loss when the opponent's team won", () => {
    expect(describeTrickOutcome(MY_TEAM, OPPONENT_TEAM)).toBe("Ganó el rival");
  });

  it("announces a win when the local player's team won", () => {
    expect(describeTrickOutcome(MY_TEAM, MY_TEAM)).toBe("Ganaste la baza");
  });

  it("announces a parda when the trick tied (winnerTeamId is null)", () => {
    expect(describeTrickOutcome(MY_TEAM, null)).toBe("Baza parda");
  });
});
