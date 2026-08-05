import { describe, expect, it } from "vitest";
import {
  applyAction,
  calculateEnvidoPoints,
  createHeadToHeadMatch,
  getLegalActions,
  getMatchWinner,
  getViewFor,
  resolveTrick,
  resolveHandWinner,
  startHand,
  type PlayedCard,
  type PlayerId,
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

  it("escalates the truco chain identically in a real browser", () => {
    const playerA = "player-a" as PlayerId;
    const playerB = "player-b" as PlayerId;
    const match = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
    const hand = startHand(match, [[], []]);

    const called = applyAction(hand, { type: "call-truco", playerId: playerA, level: "truco" });
    expect(called.ok).toBe(true);
    if (!called.ok) throw new Error("expected ok");

    expect(getLegalActions(called.state, playerB)).toEqual([
      { type: "respond-truco", playerId: playerB, response: "quiero" },
      { type: "respond-truco", playerId: playerB, response: "no-quiero" },
    ]);
  });

  it("offers the envido opening call and computes envido points identically in a real browser", () => {
    const playerA = "player-a" as PlayerId;
    const hand = startHand(
      createHeadToHeadMatch({ playerAId: playerA, playerBId: "player-b" as PlayerId, pointsToWin: 15 }),
      [[], []],
    );

    expect(getLegalActions(hand, playerA)).toContainEqual({ type: "call-envido", playerId: playerA, level: "envido" });
    expect(calculateEnvidoPoints([{ suit: "espada", rank: 4 }])).toBe(4);
  });

  it("projects a redacted per-player view identically in a real browser", () => {
    const playerA = "player-a" as PlayerId;
    const playerB = "player-b" as PlayerId;
    const hand = startHand(
      createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 }),
      [[{ suit: "espada", rank: 1 }], [{ suit: "oro", rank: 12 }]],
    );

    expect(JSON.stringify(getViewFor(hand, playerA))).not.toContain(JSON.stringify({ suit: "oro", rank: 12 }));
  });

  it("plays a card through the package's public entry point identically in a real browser", () => {
    const playerA = "player-a" as PlayerId;
    const playerB = "player-b" as PlayerId;
    const match = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
    const hand = startHand(match, [[], [{ suit: "espada", rank: 1 }]]); // mano = playerB (seat 1)

    const result = applyAction(hand, { type: "play-card", playerId: playerB, card: { suit: "espada", rank: 1 } });

    expect(result.ok).toBe(true);
  });

  it("reports no match winner for an in-progress match identically in a real browser", () => {
    const playerA = "player-a" as PlayerId;
    const playerB = "player-b" as PlayerId;
    const match = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });

    expect(getMatchWinner(match)).toBeNull();
  });
});
