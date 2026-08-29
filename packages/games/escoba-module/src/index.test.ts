import { describe, expect, it } from "vitest";
import { describeGameModule } from "@hexdev/platform-contract";
import type { PlayerId, SeatAssignment } from "@hexdev/platform-contract";
import { buildDeck } from "@hexdev/escoba-engine";
import type { Card, HandState, MatchState } from "@hexdev/escoba-engine";
import { SYSTEM_ACTOR_ID, escobaModule, escobaModule2v2, requestEscobaSystemAction } from "./index.js";
import type { EscobaModuleAction } from "./index.js";

const config = {};

/**
 * Hand-builds a reachable state directly (no shuffle/deal involved — that
 * seam is this unit's own follow-up, `./deal.ts`, tested on its own):
 * `createMatch` supplies teams/players, this attaches a `HandState` so
 * conformance has something to exercise.
 */
function dealt(module: typeof escobaModule, seats: readonly SeatAssignment[], hands: readonly (readonly Card[])[], table: readonly Card[]): MatchState {
  const created = module.createMatch(config, seats);
  const [teamA, teamB] = created.teams;
  return {
    ...created,
    players: created.players.map((player, seat) => ({ ...player, hand: [...hands[seat]!] })),
    hand: {
      table: [...table],
      stock: [],
      piles: { [teamA.id]: [], [teamB.id]: [] },
      escobas: { [teamA.id]: 0, [teamB.id]: 0 },
      turn: created.players[1]!.id,
      lastCapturer: null,
      outcome: null,
    } satisfies HandState,
  };
}

// --- 2-seat fixtures --------------------------------------------------------
const playerA = "player-a" as PlayerId;
const playerB = "player-b" as PlayerId;
const seats2p: readonly SeatAssignment[] = [
  { seat: 0, playerId: playerA },
  { seat: 1, playerId: playerB },
];
const table2p: readonly Card[] = [{ suit: "copa", rank: 10 }, { suit: "espada", rank: 2 }, { suit: "basto", rank: 3 }, { suit: "copa", rank: 6 }];

function reachable2p(): MatchState {
  return dealt(escobaModule, seats2p, [[{ suit: "espada", rank: 1 }], [{ suit: "oro", rank: 7 }]], table2p);
}
function terminal2p(): MatchState {
  const state = reachable2p();
  const [teamA, teamB] = state.teams;
  return { ...state, teams: [{ ...teamA, score: 31 }, { ...teamB, score: 20 }] };
}
// playerB's oro-7 (value 7) captures the table's lone sota (value 8): 7+8=15.
const legalAction2p: EscobaModuleAction = { type: "play-card", playerId: playerB, card: { suit: "oro", rank: 7 }, captured: [{ suit: "copa", rank: 10 }] };

describeGameModule(
  escobaModule,
  { config, seats: seats2p, playerId: playerB, reachableState: reachable2p(), legalAction: legalAction2p, terminalState: terminal2p(), botTier: "easy" },
  { describe, it, expect },
);

// --- 4-seat fixtures --------------------------------------------------------
const player0 = "player-0" as PlayerId;
const player1 = "player-1" as PlayerId;
const player2 = "player-2" as PlayerId;
const player3 = "player-3" as PlayerId;
const seats4p: readonly SeatAssignment[] = [
  { seat: 0, playerId: player0 },
  { seat: 1, playerId: player1 },
  { seat: 2, playerId: player2 },
  { seat: 3, playerId: player3 },
];
const table4p: readonly Card[] = [{ suit: "oro", rank: 10 }, { suit: "espada", rank: 2 }, { suit: "basto", rank: 2 }, { suit: "copa", rank: 7 }];

function reachable4p(): MatchState {
  return dealt(
    escobaModule2v2,
    seats4p,
    [[{ suit: "espada", rank: 1 }], [{ suit: "espada", rank: 7 }], [{ suit: "oro", rank: 1 }], [{ suit: "copa", rank: 4 }]],
    table4p,
  );
}
function terminal4p(): MatchState {
  const state = reachable4p();
  const [teamA, teamB] = state.teams;
  return { ...state, teams: [{ ...teamA, score: 31 }, { ...teamB, score: 20 }] };
}
// player1's espada-7 captures the table's lone oro-sota (value 8): 7+8=15.
const legalAction4p: EscobaModuleAction = { type: "play-card", playerId: player1, card: { suit: "espada", rank: 7 }, captured: [{ suit: "oro", rank: 10 }] };

describeGameModule(
  escobaModule2v2,
  { config, seats: seats4p, playerId: player1, reachableState: reachable4p(), legalAction: legalAction4p, terminalState: terminal4p(), botTier: "easy" },
  { describe, it, expect },
);

describe("escoba-module: adapter-specific behavior beyond the generic contract", () => {
  it("pairs 2 seats into 2 teams of one, per art. 5.1's 'a solo team is a team of one'", () => {
    const state = reachable2p();
    expect(state.teams[0].playerIds).toEqual([playerA]);
    expect(state.teams[1].playerIds).toEqual([playerB]);
  });

  it("pairs 4 seats so PARTNERS SIT ACROSS THE TABLE (0+2 vs 1+3), mirroring truco-module", () => {
    const state = reachable4p();
    expect(state.teams[0].playerIds).toEqual([player0, player2]);
    expect(state.teams[1].playerIds).toEqual([player1, player3]);
  });

  it("createBot wires the real easy tier (@hexdev/escoba-bot, slice K) — first legal action in canonical order", async () => {
    const state = reachable2p();
    const legal = escobaModule.getLegalActions(state, playerB);
    const view = escobaModule.getViewFor(state, playerB);
    const bot = escobaModule.createBot("easy");
    const chosen = await bot.chooseAction(view, legal, 50);
    expect(chosen).toEqual(legal[0]);
  });

  it("rejects starting a new hand while one is already in progress", () => {
    const result = escobaModule.applyAction(reachable2p(), { type: "start-hand", playerId: SYSTEM_ACTOR_ID, deck: buildDeck() });
    expect(result.ok).toBe(false);
  });

  it("requestEscobaSystemAction fires on a fresh match (no hand dealt yet)", () => {
    const fresh = escobaModule.createMatch(config, seats2p);
    const action = requestEscobaSystemAction(fresh, () => 0.5);
    expect(action).not.toBeNull();
    expect(action?.deck).toHaveLength(40);
  });

  it("requestEscobaSystemAction returns null while a seat can still act mid-hand", () => {
    expect(requestEscobaSystemAction(reachable2p(), () => 0.5)).toBeNull();
  });

  it("requestEscobaSystemAction returns null once the match already has a winner, even with a decided hand", () => {
    const state = reachable2p();
    const [teamA, teamB] = state.teams;
    const won: MatchState = { ...state, teams: [{ ...teamA, score: 30 }, teamB], hand: { ...state.hand!, outcome: { decided: true } } };
    expect(requestEscobaSystemAction(won, () => 0.5)).toBeNull();
  });

  it("settles hand end when the last card is played into an already-empty stock: leftover swept, scored, hand.outcome.decided flips true", () => {
    const created = escobaModule.createMatch(config, seats2p);
    const [teamA, teamB] = created.teams;
    const lastCard: Card = { suit: "oro", rank: 2 };
    const almostDone: MatchState = {
      ...created,
      players: created.players.map((player) => (player.id === playerB ? { ...player, hand: [lastCard] } : player)),
      hand: {
        table: [],
        stock: [],
        piles: { [teamA.id]: [], [teamB.id]: [] },
        escobas: { [teamA.id]: 0, [teamB.id]: 0 },
        turn: playerB,
        lastCapturer: teamA.id,
        outcome: null,
      } satisfies HandState,
    };

    const result = escobaModule.applyAction(almostDone, { type: "play-card", playerId: playerB, card: lastCard, captured: [] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // the lone leftover card (oro-2) is swept to the last capturer (team A,
    // not the player who just played it): cartas 1-0, nothing else resolves.
    expect(result.state.teams[0].score).toBe(created.teams[0].score + 1);
    expect(result.state.teams[1].score).toBe(created.teams[1].score);
    expect(result.state.hand?.outcome?.decided).toBe(true);
  });

  it("re-deals mid-hand (pure engine step) instead of settling, when the stock still has cards", () => {
    const created = escobaModule.createMatch(config, seats2p);
    const [teamA, teamB] = created.teams;
    const lastCard: Card = { suit: "basto", rank: 3 };
    const stock = buildDeck().slice(0, 6); // exactly CARDS_PER_PLAYER * seatCount
    const almostDone: MatchState = {
      ...created,
      players: created.players.map((player) => (player.id === playerB ? { ...player, hand: [lastCard] } : player)),
      hand: {
        table: [],
        stock,
        piles: { [teamA.id]: [], [teamB.id]: [] },
        escobas: { [teamA.id]: 0, [teamB.id]: 0 },
        turn: playerB,
        lastCapturer: null,
        outcome: null,
      } satisfies HandState,
    };

    const result = escobaModule.applyAction(almostDone, { type: "play-card", playerId: playerB, card: lastCard, captured: [] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.every((player) => player.hand.length === 3)).toBe(true);
    expect(result.state.hand?.stock).toHaveLength(0);
    // no scoring happened — this was a mid-hand continuation, not a hand end.
    expect(result.state.hand?.outcome).toBeNull();
    expect(result.state.teams[0].score).toBe(created.teams[0].score);
    expect(result.state.teams[1].score).toBe(created.teams[1].score);
  });
});
