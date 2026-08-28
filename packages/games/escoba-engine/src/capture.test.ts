import { describe, expect, it } from "vitest";
import { applyAction } from "./capture.js";
import type { PlayCardAction } from "./capture.js";
import type { Card, Suit, Rank } from "./card.js";
import type { MatchState, Player, Team, HandState } from "./state.js";
import type { PlayerId, TeamId } from "./ids.js";

// The rule under test — see `escoba/reglas-verificadas` and design §D4.
// Confirmed by both pagat AND art. 21.2 of the Reglamento Oficial ("El que
// pudiendo levantar quince con la carta jugada y no lo hace, faculta de
// hecho al adversario para recoger dicha baza"):
//   - a player MAY play a card that captures nothing, EVEN WHILE HOLDING
//     another card that would capture — that is tactics, not a foul;
//   - a player MAY NOT play a card that DOES form 15 and decline the
//     capture (`captured: []`);
//   - the choice is WHICH CARD TO PLAY, never whether to capture once a
//     forming card is played.

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

const PLAYER_0 = "player-0" as PlayerId;
const PLAYER_1 = "player-1" as PlayerId;
const TEAM_A = "team-a" as TeamId;
const TEAM_B = "team-b" as TeamId;

/** Builds a match already mid-hand, table and both hands set explicitly —
 * this slice validates `applyAction` against a given `HandState`, not the
 * dealing pipeline (`deal.ts`, Unit D), so there is no need to route
 * through `deal()`. */
function fixtureMatch(options: { table: readonly Card[]; hand0: readonly Card[]; hand1: readonly Card[]; turn?: PlayerId }): MatchState {
  const players: readonly Player[] = [
    { id: PLAYER_0, teamId: TEAM_A, seat: 0, hand: options.hand0 },
    { id: PLAYER_1, teamId: TEAM_B, seat: 1, hand: options.hand1 },
  ];
  const teams: readonly [Team, Team] = [
    { id: TEAM_A, playerIds: [PLAYER_0], score: 0 },
    { id: TEAM_B, playerIds: [PLAYER_1], score: 0 },
  ];
  const hand: HandState = {
    table: options.table,
    stock: [],
    piles: { [TEAM_A]: [], [TEAM_B]: [] },
    escobas: { [TEAM_A]: 0, [TEAM_B]: 0 },
    turn: options.turn ?? PLAYER_0,
    lastCapturer: null,
    outcome: null,
  };
  return { teams, players, dealerSeat: 0, hand, pointsToWin: 30 };
}

describe("applyAction — capture validation (art. 21.2 / pagat, design §D4)", () => {
  it("accepts a valid capture: the played card plus a summing subset of the table (5+3+7=15)", () => {
    const state = fixtureMatch({
      table: [card(5, "oro"), card(7, "copa"), card(2, "basto")],
      hand0: [card(3, "espada")],
      hand1: [],
    });
    const action: PlayCardAction = {
      type: "play-card",
      playerId: PLAYER_0,
      card: card(3, "espada"),
      captured: [card(5, "oro"), card(7, "copa")],
    };

    const result = applyAction(state, action);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.hand!.table).toEqual([card(2, "basto")]);
    expect(result.state.hand!.piles[TEAM_A]).toEqual([card(5, "oro"), card(7, "copa"), card(3, "espada")]);
    expect(result.state.players[0]!.hand).toEqual([]);
  });

  it("rejects a captured card that is not on the table (not-on-table)", () => {
    const state = fixtureMatch({
      table: [card(5, "oro")],
      hand0: [card(10, "espada")],
      hand1: [],
    });
    const action: PlayCardAction = {
      type: "play-card",
      playerId: PLAYER_0,
      card: card(10, "espada"),
      captured: [card(2, "basto")], // never on the table
    };

    const result = applyAction(state, action);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violation.code).toBe("not-on-table");
  });

  it("rejects a captured subset that is on the table but does not sum to 15 with the played card (not-fifteen)", () => {
    const state = fixtureMatch({
      table: [card(5, "oro"), card(7, "copa")],
      hand0: [card(1, "espada")],
      hand1: [],
    });
    const action: PlayCardAction = {
      type: "play-card",
      playerId: PLAYER_0,
      card: card(1, "espada"),
      captured: [card(5, "oro")], // 5 + 1 = 6, not 15
    };

    const result = applyAction(state, action);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violation.code).toBe("not-fifteen");
  });

  it("rejects a card that DOES form 15 when the player declines the capture with captured: [] (capture-declined, art. 21.2)", () => {
    const state = fixtureMatch({
      table: [card(10, "oro")], // sota, value 8
      hand0: [card(7, "espada")], // value 7; 7 + 8 = 15
      hand1: [],
    });
    const action: PlayCardAction = {
      type: "play-card",
      playerId: PLAYER_0,
      card: card(7, "espada"),
      captured: [],
    };

    const result = applyAction(state, action);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violation.code).toBe("capture-declined");
  });

  it("accepts a card that forms NO 15 with captured: [] — it stays face up on the table", () => {
    const state = fixtureMatch({
      table: [card(2, "oro")], // value 2; 15 - 7 = 8, unreachable from a lone 2
      hand0: [card(7, "espada")],
      hand1: [],
    });
    const action: PlayCardAction = {
      type: "play-card",
      playerId: PLAYER_0,
      card: card(7, "espada"),
      captured: [],
    };

    const result = applyAction(state, action);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.hand!.table).toEqual([card(2, "oro"), card(7, "espada")]);
    expect(result.state.hand!.piles[TEAM_A]).toEqual([]);
    expect(result.state.players[0]!.hand).toEqual([]);
  });

  it("lets a player legally withhold a capturing card by playing a different, non-forming card instead (tactics, not a foul)", () => {
    const state = fixtureMatch({
      table: [card(10, "copa")], // sota, value 8 — a 7 in hand WOULD capture it (7+8=15)
      hand0: [card(7, "oro"), card(4, "espada")], // 4: 15-4=11, unreachable from a lone 8
      hand1: [],
    });
    const action: PlayCardAction = {
      type: "play-card",
      playerId: PLAYER_0,
      card: card(4, "espada"),
      captured: [],
    };

    const result = applyAction(state, action);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // the 4 joins the table, face up; the capturing 7 is still held, untouched
    expect(result.state.hand!.table).toEqual([card(10, "copa"), card(4, "espada")]);
    expect(result.state.players[0]!.hand).toEqual([card(7, "oro")]);
  });

  it("rejects an action from a player who is not on turn", () => {
    const state = fixtureMatch({
      table: [],
      hand0: [card(3, "espada")],
      hand1: [card(4, "oro")],
      turn: PLAYER_0,
    });
    const action: PlayCardAction = { type: "play-card", playerId: PLAYER_1, card: card(4, "oro"), captured: [] };

    const result = applyAction(state, action);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violation.code).toBe("not-on-turn");
  });

  it("rejects a card that is not in the acting player's hand", () => {
    const state = fixtureMatch({ table: [], hand0: [card(3, "espada")], hand1: [] });
    const action: PlayCardAction = { type: "play-card", playerId: PLAYER_0, card: card(6, "oro"), captured: [] };

    const result = applyAction(state, action);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violation.code).toBe("not-in-hand");
  });
});
