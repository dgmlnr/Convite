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
    // dealerSeat 1 -> playerA is the mano, which is who calls below: opening
    // a call is taking the floor (truco-chain.ts), and the floor starts there.
    const match = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15, dealerSeat: 1 });
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

  it("calls envido and computes envido points through the package's public entry point", () => {
    const playerA = "player-a" as PlayerId;
    const hand = startHand(
      // dealerSeat 1 makes playerA the mano, which is who may open an envido:
      // taking the floor starts with the mano (envido-chain.ts). The default
      // of 0 would have this smoke test opening out of turn.
      createHeadToHeadMatch({ playerAId: playerA, playerBId: "player-b" as PlayerId, pointsToWin: 15, dealerSeat: 1 }),
      [[], []],
    );
    const called = applyAction(hand, { type: "call-envido", playerId: playerA, level: "envido" });

    expect(called.ok && called.state.hand?.envido.status).toBe("pending");
    expect(calculateEnvidoPoints([{ suit: "oro", rank: 7 }])).toBe(7);
  });

  it("projects a redacted per-player view through the package's public entry point", () => {
    const playerA = "player-a" as PlayerId;
    const playerB = "player-b" as PlayerId;
    const match = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
    const hand = startHand(match, [[{ suit: "espada", rank: 1 }], [{ suit: "oro", rank: 12 }]]);

    const view = getViewFor(hand, playerA);

    expect(view.self.hand).toEqual([{ suit: "espada", rank: 1 }]);
    expect(view.opponents).toEqual([{ playerId: playerB, teamId: hand.teams[1]!.id, seat: 1, cardsRemaining: 1 }]);
  });

  it("plays a card through the package's public entry point and records it as a legal, wired-up trick play", () => {
    const playerA = "player-a" as PlayerId;
    const playerB = "player-b" as PlayerId;
    const match = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15 });
    const hand = startHand(match, [[], [{ suit: "espada", rank: 1 }]]); // mano = playerB (seat 1)

    const result = applyAction(hand, { type: "play-card", playerId: playerB, card: { suit: "espada", rank: 1 } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.state.hand?.trickOutcomes).toEqual([]);
    expect(result.state.players[1]!.hand).toEqual([]);
  });

  it("reports the match winner once a team's score reaches the target through the package's public entry point", () => {
    const playerA = "player-a" as PlayerId;
    const playerB = "player-b" as PlayerId;
    // dealerSeat 1 -> playerA is the mano, which is who calls below: opening
    // a call is taking the floor (truco-chain.ts), and the floor starts there.
    const match = createHeadToHeadMatch({ playerAId: playerA, playerBId: playerB, pointsToWin: 15, dealerSeat: 1 });
    const oneCallFromTarget = { ...match, teams: [{ ...match.teams[0]!, score: 14 }, match.teams[1]!] };
    const hand = startHand(oneCallFromTarget, [[], []]);
    const called = applyAction(hand, { type: "call-truco", playerId: playerA, level: "truco" });
    if (!called.ok) throw new Error("expected ok");
    const declined = applyAction(called.state, { type: "respond-truco", playerId: playerB, response: "no-quiero" });
    if (!declined.ok) throw new Error("expected ok");

    expect(getMatchWinner(declined.state)).toBe(declined.state.teams[0]!.id);
  });
});
