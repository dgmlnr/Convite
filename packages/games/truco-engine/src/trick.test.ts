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

/**
 * 2v2 generalization (design: "partners seated across from each other").
 * `resolveTrick` now takes any non-empty `PlayedCard[]`; the team's best
 * card among its own plays represents the team for that trick — a strict
 * generalization of the 1v1 "each team has exactly one play" case above.
 */
describe("resolveTrick — 2v2 (four plays, two teams of two)", () => {
  it("a team wins outright when its best play beats the other team's best play, even though a teammate played weaker", () => {
    const plays: readonly PlayedCard[] = [
      { teamId: teamA, card: { suit: "oro", rank: 4 } }, // teamA weak play
      { teamId: teamB, card: { suit: "basto", rank: 5 } }, // teamB weak play
      { teamId: teamA, card: { suit: "espada", rank: 1 } }, // teamA's best (as de espada — top card)
      { teamId: teamB, card: { suit: "oro", rank: 7 } }, // teamB's best
    ];

    expect(resolveTrick(plays).winnerTeamId).toBe(teamA);
  });

  it("records a parda when the two teams' BEST plays tie in power, even though no two individual cards are identical", () => {
    const plays: readonly PlayedCard[] = [
      { teamId: teamA, card: { suit: "espada", rank: 10 } }, // teamA's best
      { teamId: teamB, card: { suit: "basto", rank: 5 } }, // weaker than either team's best
      { teamId: teamA, card: { suit: "oro", rank: 4 } }, // weaker than either team's best
      { teamId: teamB, card: { suit: "oro", rank: 10 } }, // ties teamA's best (rank 10 is one power group regardless of suit)
    ];

    expect(resolveTrick(plays).winnerTeamId).toBeNull();
  });

  it("a team wins when both its cards individually beat the other team's best (no ambiguity from the teammate tie)", () => {
    const plays: readonly PlayedCard[] = [
      { teamId: teamA, card: { suit: "basto", rank: 1 } }, // as de basto — very strong
      { teamId: teamA, card: { suit: "espada", rank: 1 } }, // as de espada — strongest card in the deck
      { teamId: teamB, card: { suit: "oro", rank: 7 } },
      { teamId: teamB, card: { suit: "espada", rank: 7 } }, // siete de espada — strong but below both teamA cards
    ];

    expect(resolveTrick(plays).winnerTeamId).toBe(teamA);
  });
});
