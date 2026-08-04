import { describe, expect, it } from "vitest";
import type { TeamId } from "./ids.js";
import { resolveTrick, type PlayedCard } from "./trick.js";

const teamA = "team-a" as TeamId;
const teamB = "team-b" as TeamId;

describe("resolveTrick", () => {
  it("declares the higher-ranked card's team the winner", () => {
    const plays: readonly [PlayedCard, PlayedCard] = [
      { teamId: teamA, card: { suit: "espada", rank: 1 } },
      { teamId: teamB, card: { suit: "oro", rank: 4 } },
    ];

    expect(resolveTrick(plays).winnerTeamId).toBe(teamA);
  });

  it("records a parda when both played cards have equal power", () => {
    const plays: readonly [PlayedCard, PlayedCard] = [
      { teamId: teamA, card: { suit: "espada", rank: 12 } },
      { teamId: teamB, card: { suit: "oro", rank: 12 } },
    ];

    expect(resolveTrick(plays).winnerTeamId).toBeNull();
  });

  it("does not depend on which team played first", () => {
    const winnerFirst: readonly [PlayedCard, PlayedCard] = [
      { teamId: teamA, card: { suit: "espada", rank: 1 } },
      { teamId: teamB, card: { suit: "oro", rank: 4 } },
    ];
    const winnerSecond: readonly [PlayedCard, PlayedCard] = [
      { teamId: teamB, card: { suit: "oro", rank: 4 } },
      { teamId: teamA, card: { suit: "espada", rank: 1 } },
    ];

    expect(resolveTrick(winnerFirst).winnerTeamId).toBe(teamA);
    expect(resolveTrick(winnerSecond).winnerTeamId).toBe(teamA);
  });
});
