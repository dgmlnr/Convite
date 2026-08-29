import { describe, expect, it } from "vitest";
import { getViewFor } from "@hexdev/escoba-engine";
import type { Card, HandState, MatchState, Player, PlayerId, Team, TeamId } from "@hexdev/escoba-engine";
import { createBotStrategy } from "./index.js";
import { card } from "./fixtures.js";

/**
 * K.3 (contract.ts:60-89, decision 2): a bot must not read hidden state,
 * and in the 4-seat game that means it must not see its OWN PARTNER'S
 * hand — escoba registers no consult channel at all (design §D3), so
 * there is no path for a partner's hand to legitimately reach a bot
 * either. `PlayerView.others` (view.ts) structurally carries only
 * `cardsRemaining` for every other seat, teammate included — this test is
 * the runtime safety net for that compile-time fence, the same discipline
 * `view.test.ts`'s stock JSON-scan already uses for D2's redaction.
 *
 * A hand-built 4-seat state (mirrors `escoba-module`'s `buildMatch2v2`
 * pairing: seats 0+2 vs 1+3) so seat 0's TEAMMATE (seat 2) holds a
 * distinct, identifiable card nowhere else in the state.
 */
function fixtureMatch2v2(): { state: MatchState; seat0: PlayerId; teammateCard: Card } {
  const teammateCard = card(3, "copa"); // held ONLY by seat 2 — must never surface in seat 0's view
  const seat0 = "player-0" as PlayerId;
  const seat1 = "player-1" as PlayerId;
  const seat2 = "player-2" as PlayerId;
  const seat3 = "player-3" as PlayerId;
  const teamA = "team-a" as TeamId;
  const teamB = "team-b" as TeamId;
  const players: readonly Player[] = [
    { id: seat0, teamId: teamA, seat: 0, hand: [card(4, "oro"), card(5, "espada")] },
    { id: seat1, teamId: teamB, seat: 1, hand: [card(6, "basto")] },
    { id: seat2, teamId: teamA, seat: 2, hand: [teammateCard] },
    { id: seat3, teamId: teamB, seat: 3, hand: [card(2, "oro")] },
  ];
  const teams: readonly [Team, Team] = [
    { id: teamA, playerIds: [seat0, seat2], score: 0 },
    { id: teamB, playerIds: [seat1, seat3], score: 0 },
  ];
  const hand: HandState = {
    table: [card(7, "basto")],
    stock: [],
    piles: { [teamA]: [], [teamB]: [] },
    escobas: { [teamA]: 0, [teamB]: 0 },
    turn: seat0,
    lastCapturer: null,
    outcome: null,
  };
  return { state: { teams, players, dealerSeat: 0, hand, pointsToWin: 30 }, seat0, teammateCard };
}

describe("the bot's view excludes the teammate's hand contents in a 4-seat match (K.3)", () => {
  const { state, seat0, teammateCard } = fixtureMatch2v2();
  const view = getViewFor(state, seat0);

  it("the view handed to chooseAction never contains the teammate's card, by JSON scan", () => {
    const serialized = JSON.stringify(view);
    expect(serialized.includes(JSON.stringify(teammateCard))).toBe(false);
  });

  it("the teammate entry in `others` carries only a count, no `hand` field", () => {
    const teammate = view.others.find((other) => other.teamId === view.self.teamId);
    expect(teammate).toBeDefined();
    expect(teammate).not.toHaveProperty("hand");
    expect(teammate?.cardsRemaining).toBe(1);
  });

  for (const tier of ["easy", "normal", "hard"] as const) {
    it(`${tier}'s chosen action is drawn only from what the view offers — never a teammate card`, () => {
      const legal = [{ type: "play-card" as const, playerId: seat0, card: view.self.hand[0]!, captured: [] }];
      const chosen = createBotStrategy(tier, () => 0).chooseAction(view, legal, 1000);
      expect(JSON.stringify(chosen).includes(JSON.stringify(teammateCard))).toBe(false);
    });
  }
});
