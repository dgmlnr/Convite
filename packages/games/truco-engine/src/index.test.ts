import { describe, expect, it } from "vitest";
import {
  resolveTrick,
  resolveHandWinner,
  type PlayedCard,
  type TeamId,
} from "./index.js";

describe("truco-engine public API (node)", () => {
  it("resolves a trick through the package's public entry point", () => {
    const teamA = "team-a" as TeamId;
    const teamB = "team-b" as TeamId;
    const plays: readonly [PlayedCard, PlayedCard] = [
      { teamId: teamA, card: { suit: "espada", rank: 1 } },
      { teamId: teamB, card: { suit: "oro", rank: 4 } },
    ];

    expect(resolveTrick(plays).winnerTeamId).toBe(teamA);
  });

  it("resolves a hand winner (parda rule) through the package's public entry point", () => {
    const teamA = "team-a" as TeamId;
    const teamB = "team-b" as TeamId;

    const result = resolveHandWinner(
      [{ winnerTeamId: null }, { winnerTeamId: teamA }],
      teamB,
    );

    expect(result).toEqual({ decided: true, winnerTeamId: teamA });
  });
});
