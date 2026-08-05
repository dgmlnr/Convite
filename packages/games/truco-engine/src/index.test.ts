import { describe, expect, it } from "vitest";
import {
  applyAction,
  createHeadToHeadMatch,
  getLegalActions,
  resolveTrick,
  resolveHandWinner,
  startHand,
  type PlayedCard,
  type PlayerId,
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

  it("escalates and declines the truco chain through the package's public entry point", () => {
    const playerA = "player-a" as PlayerId;
    const playerB = "player-b" as PlayerId;
    const match = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
    const hand = startHand(match, [[], []]);

    const called = applyAction(hand, { type: "call-truco", playerId: playerA, level: "truco" });
    expect(called.ok).toBe(true);
    if (!called.ok) throw new Error("expected ok");

    const declined = applyAction(called.state, { type: "respond-truco", playerId: playerB, response: "no-quiero" });
    expect(declined.ok).toBe(true);
    if (!declined.ok) throw new Error("expected ok");

    expect(declined.state.teams[0]!.score).toBe(1);
    expect(getLegalActions(declined.state, playerA)).toEqual([]);
  });
});
