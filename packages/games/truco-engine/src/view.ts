import type { Card } from "./card.js";
import type { HandOutcome } from "./hand-winner.js";
import type { PlayerId, TeamId } from "./ids.js";
import type { EnvidoState, HandPlay, MatchConfig, MatchState, TrucoState } from "./match.js";
import type { TrickOutcome } from "./trick.js";

/**
 * No field on `PlayerView` (or its nested types) is capable of structurally
 * holding another player's hand — design §4: "a redaction bug is a COMPILE
 * ERROR, not a runtime leak". Opponents/teammates expose only a card COUNT.
 */
export interface OpponentView {
  readonly playerId: PlayerId;
  readonly teamId: TeamId;
  readonly cardsRemaining: number;
}

/** Always empty in v1 (single-player teams) — the shape exists so v2 adds
 * data without changing this type or re-auditing the projection (design §4). */
export interface TeammateView {
  readonly playerId: PlayerId;
  readonly cardsRemaining: number;
}

export interface HandView {
  readonly manoSeat: number;
  readonly truco: TrucoState;
  readonly envido: EnvidoState;
  readonly turnSeat: number;
  /** Already-played cards for the trick in progress — public, unlike hand cards. */
  readonly currentTrickPlays: readonly HandPlay[];
  readonly trickOutcomes: readonly TrickOutcome[];
  readonly outcome: HandOutcome;
}

export interface PlayerView {
  readonly self: { readonly playerId: PlayerId; readonly teamId: TeamId; readonly hand: readonly Card[] };
  readonly teammates: readonly TeammateView[];
  readonly opponents: readonly OpponentView[];
  readonly teams: readonly { readonly id: TeamId; readonly score: number }[];
  readonly hand: HandView | null;
  readonly config: MatchConfig;
  readonly dealerSeat: number;
}

/**
 * Per-player projection (spec: "Per-Player View Redaction"). Every field is
 * built explicitly from primitives — never spread from `Player`/`MatchState`
 * — so an opponent's `hand` can never reach the return value, structurally
 * or by accident.
 */
export function getViewFor(state: MatchState, playerId: PlayerId): PlayerView {
  const self = state.players.find((player) => player.id === playerId);
  if (self === undefined) {
    throw new Error(`unknown player: ${playerId}`);
  }

  const teammates: TeammateView[] = [];
  const opponents: OpponentView[] = [];
  for (const player of state.players) {
    if (player.id === self.id) continue;
    if (player.teamId === self.teamId) {
      teammates.push({ playerId: player.id, cardsRemaining: player.hand.length });
    } else {
      opponents.push({ playerId: player.id, teamId: player.teamId, cardsRemaining: player.hand.length });
    }
  }

  return {
    self: { playerId: self.id, teamId: self.teamId, hand: self.hand },
    teammates,
    opponents,
    teams: state.teams.map((team) => ({ id: team.id, score: team.score })),
    hand:
      state.hand === null
        ? null
        : {
            manoSeat: state.hand.manoSeat,
            truco: state.hand.truco,
            envido: state.hand.envido,
            turnSeat: state.hand.turnSeat,
            currentTrickPlays: state.hand.currentTrickPlays,
            trickOutcomes: state.hand.trickOutcomes,
            outcome: state.hand.outcome,
          },
    config: state.config,
    dealerSeat: state.dealerSeat,
  };
}
