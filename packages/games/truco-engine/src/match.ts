import type { Card } from "./card.js";
import type { PlayerId, TeamId } from "./ids.js";

export interface Team {
  readonly id: TeamId;
  readonly playerIds: readonly PlayerId[];
  readonly score: number;
}

export interface Player {
  readonly id: PlayerId;
  readonly teamId: TeamId;
  readonly seat: number;
  readonly hand: readonly Card[];
}

export interface MatchConfig {
  readonly pointsToWin: 15 | 30;
}

export type TrucoCallLevel = "truco" | "retruco" | "valeCuatro";

/** Truco call-chain state for the current hand (spec: "Truco Call Chain").
 * `pending`: the other team must respond. `accepted`: only the accepting
 * team may escalate. `declined`: hand over, nothing further is legal. */
export type TrucoState =
  | { readonly status: "none" }
  | { readonly status: "pending"; readonly level: TrucoCallLevel; readonly callingTeamId: TeamId }
  | { readonly status: "accepted"; readonly level: TrucoCallLevel; readonly callingTeamId: TeamId }
  | {
      readonly status: "declined";
      readonly level: TrucoCallLevel;
      readonly callingTeamId: TeamId;
      readonly decliningTeamId: TeamId;
    };

export type EnvidoCallLevel = "envido" | "envidoEnvido" | "realEnvido" | "faltaEnvido";

/** Envido call-chain state (spec: "Envido Call Chain and Scoring"). `calls` is
 * the ordered chain, oldest first — cumulative-accept and decline values are
 * pure functions of it. `accepted` freezes the value; `revealed` awards it. */
export type EnvidoState =
  | { readonly status: "none" }
  | { readonly status: "pending"; readonly calls: readonly EnvidoCallLevel[]; readonly callingTeamId: TeamId }
  | { readonly status: "accepted"; readonly calls: readonly EnvidoCallLevel[]; readonly callingTeamId: TeamId; readonly acceptedValue: number }
  | { readonly status: "declined"; readonly calls: readonly EnvidoCallLevel[]; readonly callingTeamId: TeamId; readonly decliningTeamId: TeamId }
  | { readonly status: "revealed"; readonly calls: readonly EnvidoCallLevel[]; readonly winningTeamId: TeamId; readonly awardedValue: number };

/** State materialized once a hand's deal has been dealt (design §4). */
export interface HandState {
  readonly manoSeat: number;
  readonly truco: TrucoState;
  readonly envido: EnvidoState;
}

export interface MatchState {
  readonly config: MatchConfig;
  readonly teams: readonly Team[];
  readonly players: readonly Player[];
  /** Seat of the current dealer; mano is the seat immediately to its right. */
  readonly dealerSeat: number;
  readonly hand: HandState | null;
}

/** Cards already dealt to each seat, index-aligned with `Player.seat`. The
 * engine never randomizes: the caller (server, test fixture, or ISMCTS
 * sampler) supplies the materialized deal. */
export type DealInput = readonly (readonly Card[])[];

/** Mano is the player immediately to the dealer's right (design §4). */
export function manoSeatFor(dealerSeat: number, playerCount: number): number {
  return (dealerSeat + 1) % playerCount;
}

/**
 * v1 instantiates exactly two teams of one player each (design §4). Score
 * lives on `Team`, never on `Player`.
 */
export function createHeadToHeadMatch(params: {
  readonly playerAId: PlayerId;
  readonly playerBId: PlayerId;
  readonly pointsToWin: 15 | 30;
  readonly dealerSeat?: number;
}): MatchState {
  const teamAId = `${params.playerAId}:team` as TeamId;
  const teamBId = `${params.playerBId}:team` as TeamId;

  const teams: readonly Team[] = [
    { id: teamAId, playerIds: [params.playerAId], score: 0 },
    { id: teamBId, playerIds: [params.playerBId], score: 0 },
  ];

  const players: readonly Player[] = [
    { id: params.playerAId, teamId: teamAId, seat: 0, hand: [] },
    { id: params.playerBId, teamId: teamBId, seat: 1, hand: [] },
  ];

  return {
    config: { pointsToWin: params.pointsToWin },
    teams,
    players,
    dealerSeat: params.dealerSeat ?? 0,
    hand: null,
  };
}

/**
 * Materializes a new hand from an already-dealt `deal` — the engine never
 * shuffles or randomizes (design §4). Returns a new `MatchState`; the input
 * is never mutated.
 */
export function startHand(state: MatchState, deal: DealInput): MatchState {
  const players = state.players.map((player) => {
    const hand = deal[player.seat];
    if (hand === undefined) {
      throw new Error(`no deal supplied for seat ${player.seat}`);
    }
    return { ...player, hand };
  });

  return {
    ...state,
    players,
    hand: {
      manoSeat: manoSeatFor(state.dealerSeat, state.players.length),
      truco: { status: "none" },
      envido: { status: "none" },
    },
  };
}

/** Advances the dealer to the next seat, which rotates mano for the next hand. */
export function rotateDealer(state: MatchState): MatchState {
  return { ...state, dealerSeat: (state.dealerSeat + 1) % state.players.length };
}
