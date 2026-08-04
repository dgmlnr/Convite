import { describe, expect, it } from "vitest";
import {
  resolveTrick,
  resolveHandWinner,
  type PlayedCard,
  type TeamId,
} from "./index.js";

describe("truco-engine public API (browser)", () => {
  it("resolves a trick identically in a real browser, proving Node/browser parity", () => {
    const teamA = "team-a" as TeamId;
    const teamB = "team-b" as TeamId;
    const plays: readonly [PlayedCard, PlayedCard] = [
      { teamId: teamA, card: { suit: "oro", rank: 4 } },
      { teamId: teamB, card: { suit: "espada", rank: 1 } },
    ];

    expect(resolveTrick(plays).winnerTeamId).toBe(teamB);
  });

  it("resolves a hand winner (parda rule) identically in a real browser", () => {
    const teamB = "team-b" as TeamId;

    const result = resolveHandWinner(
      [{ winnerTeamId: null }, { winnerTeamId: null }, { winnerTeamId: null }],
      teamB,
    );

    expect(result).toEqual({ decided: true, winnerTeamId: teamB });
  });
});
