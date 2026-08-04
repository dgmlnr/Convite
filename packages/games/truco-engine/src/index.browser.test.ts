import { describe, expect, it } from "vitest";
import { resolveTrick, type PlayedCard, type TeamId } from "./index.js";

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
});
