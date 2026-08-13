import type { Card } from "./card.js";
import type { HandOutcome } from "./hand-winner.js";
import type { PlayerId, TeamId } from "./ids.js";
import type { SenaSignal } from "./senas.js";
import type { TrickOutcome } from "./trick.js";

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
  | { readonly status: "revealed"; readonly calls: readonly EnvidoCallLevel[]; readonly winningTeamId: TeamId; readonly awardedValue: number;
      /** Mano-rotation order, oldest first. Present ONLY on `revealed` — an
       * envido that was never called, or was declined, has no variant that
       * can hold a declaration list (design §2.3). `winningTeamId` above is
       * DERIVED from this list (D-2) — see `resolveEnvidoDeclarations` and
       * the `reveal-envido` branch in envido-chain.ts. */
      readonly declarations: readonly EnvidoDeclaration[] };

/** What one player SAID at the envido reveal, in mano declaration order.
 *
 * The withheld variant has NO `points` KEY AT ALL — the same structural
 * discipline `OpponentView` uses for `lastSena` (view.ts:13-31): a leak is a
 * compile error, not a runtime check someone could forget.
 *
 * Stronger than the seña case, and deliberately so: a withholder's number is
 * never COMPUTED INTO STATE in the first place (see `resolveEnvidoDeclarations`
 * in envido-chain.ts), so there is no redacted-at-projection step to get
 * wrong. `getViewFor` can keep projecting `envido` as one already-public
 * value (D-6). */
export type EnvidoDeclaration =
  | { readonly declaration: "points"; readonly playerId: PlayerId; readonly teamId: TeamId; readonly seat: number; readonly points: number }
  | { readonly declaration: "sonBuenas"; readonly playerId: PlayerId; readonly teamId: TeamId; readonly seat: number };

/** A recorded seña (design: closed vocabulary, a claim not a verified
 * statement). `teamId` is carried alongside `playerId` purely so the view
 * projection can build a teammate's exposure without a second lookup —
 * exactly the same convention `HandPlay` already uses for card plays. */
export interface SenaEvent {
  readonly playerId: PlayerId;
  readonly teamId: TeamId;
  readonly signal: SenaSignal;
  /** Strictly increasing within the hand, assigned by `applySenaAction`.
   *
   * Load-bearing, not bookkeeping: this array keeps only the LATEST entry per
   * player (a seña reflects current intent, not a log), so two consecutive
   * snapshots of a player who re-sent the SAME signal are otherwise
   * byte-identical — indistinguishable from "nothing happened". A viewer
   * diffing snapshots to show a transient notice would silently never fire.
   * The ordinal is what makes "signaled again" observable downstream.
   *
   * A pure counter, never a clock: the engine is a deterministic reducer with
   * no time source, and it must not grow one. `1` for the hand's first seña;
   * hand-scoped, so it starts over with every deal exactly like the rest of
   * `HandState`. */
  readonly seq: number;
}

/** A single played card, recorded with its player/team/seat so trick
 * advancement and turn validation can be driven off it (card play is public
 * once played — the redaction constraint only covers UNPLAYED hand cards). */
export interface HandPlay {
  readonly playerId: PlayerId;
  readonly teamId: TeamId;
  readonly seat: number;
  readonly card: Card;
}

/** One thing a player SAID out loud this hand, in order. Append-only and
 * deal-scoped (unlike `senas`, which deliberately replaces per player).
 * `playerId`/`teamId`/`seat` are carried inline for exactly the reason
 * `HandPlay` and `SenaEvent` already carry them: the view projection and the
 * UI must attribute an event to a seat without a second lookup.
 *
 * DISCRIMINANT IS `kind`, NOT `type` — deliberately. `Action` variants use
 * `type`; a `CallEvent` that also used `type` would be structurally
 * ASSIGNABLE to `CallTrucoAction`/`RespondEnvidoAction` (excess-property
 * checks only bite on object literals), so an event could be fed back into
 * `applyAction` by accident and silently re-apply a call. `kind` makes that
 * a compile error.
 *
 * SEÑAS ARE NOT CALL EVENTS. This log is public table speech only; a seña is
 * private to one team and has its own redacted channel (`TeammateView.lastSena`).
 * Adding a seña-shaped variant here would leak it to every viewer. */
export type CallEvent =
  | { readonly kind: "truco-call"; readonly playerId: PlayerId; readonly teamId: TeamId; readonly seat: number; readonly level: TrucoCallLevel }
  | { readonly kind: "truco-response"; readonly playerId: PlayerId; readonly teamId: TeamId; readonly seat: number; readonly response: "quiero" | "no-quiero" }
  | { readonly kind: "envido-call"; readonly playerId: PlayerId; readonly teamId: TeamId; readonly seat: number; readonly level: EnvidoCallLevel }
  | { readonly kind: "envido-response"; readonly playerId: PlayerId; readonly teamId: TeamId; readonly seat: number; readonly response: "quiero" | "no-quiero" }
  | { readonly kind: "envido-reveal"; readonly playerId: PlayerId; readonly teamId: TeamId; readonly seat: number };

/** State materialized once a hand's deal has been dealt (design §4). */
export interface HandState {
  readonly manoSeat: number;
  readonly truco: TrucoState;
  readonly envido: EnvidoState;
  /** Seat whose turn it is to play a card next. */
  readonly turnSeat: number;
  /** Plays recorded for the trick currently in progress (0 or 1 — resets to
   * `[]` once the trick's second card resolves it). */
  readonly currentTrickPlays: readonly HandPlay[];
  /** Completed trick outcomes, oldest first — feeds `resolveHandWinner` directly. */
  readonly trickOutcomes: readonly TrickOutcome[];
  /** Whether card play has decided the hand yet (`resolveHandWinner`'s result). */
  readonly outcome: HandOutcome;
  /** The current señas in play this hand, latest one per player (2v2 only —
   * always empty in a 1v1 match, since `getLegalSenaActions` never offers
   * `send-sena` to a player without a teammate). */
  readonly senas: readonly SenaEvent[];
  /** Every trick already resolved this hand, oldest first, each holding that
   * trick's own plays in play order. INDEX-ALIGNED with `trickOutcomes` —
   * both are appended in the same atomic transition in `card-play.ts`.
   * `currentTrickPlays` keeps its exact prior meaning, so `canOpenEnvido`'s
   * first-trick gate and turn advancement are untouched (spec: "Retain
   * All-Trick Plays"). */
  readonly resolvedTrickPlays: readonly (readonly HandPlay[])[];
  /** Ordered public speech this hand. Append-only, never overwritten
   * (spec: "Ordered Call Log"). */
  readonly callEvents: readonly CallEvent[];
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
 * 2v2. Seats are assigned 0..3 in `seatOrder`; PARTNERS SIT ACROSS THE TABLE
 * FROM EACH OTHER, so team membership ALTERNATES by seat (0/2 vs 1/3) rather
 * than pairing adjacent seats (0/1 vs 2/3) — the same geometry the table UI's
 * four anchors (top/bottom/left/right) already assume. Score lives on `Team`
 * exactly as in `createHeadToHeadMatch`; this is additive, not a rewrite of
 * the 1v1 path (design §4's whole point).
 */
export function createTeamMatch(params: {
  readonly seatOrder: readonly [PlayerId, PlayerId, PlayerId, PlayerId];
  readonly pointsToWin: 15 | 30;
  readonly dealerSeat?: number;
}): MatchState {
  const [seat0, seat1, seat2, seat3] = params.seatOrder;
  const teamAId = `${seat0}:${seat2}:team` as TeamId;
  const teamBId = `${seat1}:${seat3}:team` as TeamId;

  const teams: readonly Team[] = [
    { id: teamAId, playerIds: [seat0, seat2], score: 0 },
    { id: teamBId, playerIds: [seat1, seat3], score: 0 },
  ];

  const players: readonly Player[] = [
    { id: seat0, teamId: teamAId, seat: 0, hand: [] },
    { id: seat1, teamId: teamBId, seat: 1, hand: [] },
    { id: seat2, teamId: teamAId, seat: 2, hand: [] },
    { id: seat3, teamId: teamBId, seat: 3, hand: [] },
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

  const manoSeat = manoSeatFor(state.dealerSeat, state.players.length);
  return {
    ...state,
    players,
    hand: {
      manoSeat,
      truco: { status: "none" },
      envido: { status: "none" },
      turnSeat: manoSeat,
      currentTrickPlays: [],
      trickOutcomes: [],
      outcome: { decided: false },
      senas: [],
      resolvedTrickPlays: [],
      callEvents: [],
    },
  };
}

/**
 * The winning team once a score has reached the target, or `null` while the
 * match is still in progress (spec: "Match and Hand Termination"). Derived
 * from `teams` rather than stored, so it can never drift out of sync.
 */
export function getMatchWinner(state: MatchState): TeamId | null {
  return state.teams.find((team) => team.score >= state.config.pointsToWin)?.id ?? null;
}

/** Advances the dealer to the next seat, which rotates mano for the next hand. */
export function rotateDealer(state: MatchState): MatchState {
  return { ...state, dealerSeat: (state.dealerSeat + 1) % state.players.length };
}
