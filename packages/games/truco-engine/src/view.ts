import type { Card } from "./card.js";
import type { HandOutcome } from "./hand-winner.js";
import type { PlayerId, TeamId } from "./ids.js";
import type { EnvidoState, HandPlay, MatchConfig, MatchState, TrucoState } from "./match.js";
import type { SenaSignal } from "./senas.js";
import type { TrickOutcome } from "./trick.js";

/**
 * No field on `PlayerView` (or its nested types) is capable of structurally
 * holding another player's hand — design §4: "a redaction bug is a COMPILE
 * ERROR, not a runtime leak". Opponents/teammates expose only a card COUNT.
 */
/**
 * DELIBERATELY has NO seña field. This is the structural half of "delivered
 * only to the teammate": an opponent's own view TYPE has no place to put a
 * seña, so a leak into it is a compile error, not a runtime check someone
 * could forget (design §4's own redaction discipline, extended — never
 * weakened — to señas). If a future change ever adds a seña-shaped field
 * here, that is the bug; do not "fix" the type to make it compile.
 */
export interface OpponentView {
  readonly playerId: PlayerId;
  readonly teamId: TeamId;
  /** Seat is public table geometry, never hidden information (unlike
   * `hand`) — the UI needs it to place opponents at the correct anchor
   * (bottom/top/left/right) relative to the local player (obs 2970: "the
   * table is never shown from outside"). Safe to expose without weakening
   * the redaction guarantee this file's own docstring describes. */
  readonly seat: number;
  readonly cardsRemaining: number;
}

/** Always empty in v1 (single-player teams) — the shape exists so v2 adds
 * data without changing this type or re-auditing the projection (design §4).
 * `lastSena` is v2's own addition: the teammate's most recent claimed
 * signal, or `null` if they haven't signaled this hand. This is the ONLY
 * place a seña may structurally appear for someone other than its sender —
 * `OpponentView` above has no such field at all. */
export interface TeammateView {
  readonly playerId: PlayerId;
  readonly seat: number;
  readonly cardsRemaining: number;
  readonly lastSena: SenaSignal | null;
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
  readonly self: {
    readonly playerId: PlayerId;
    readonly teamId: TeamId;
    readonly seat: number;
    readonly hand: readonly Card[];
    /** The viewer's OWN most recent signal — self-confirmation for the
     * sending UI, never another player's data, so this does not touch the
     * redaction guarantee at all (a player always sees their own claim). */
    readonly lastSena: SenaSignal | null;
  };
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

  // The teammate-vs-opponent branch below is THE redaction check for señas:
  // it is the ONLY place that decides which array (teammate-shaped, with a
  // seña slot, or opponent-shaped, with none) a player's data goes into.
  // Weakening this condition is exactly the mutation the redaction proof
  // must catch.
  const lastSenaFor = (playerId: PlayerId): SenaSignal | null =>
    state.hand?.senas.find((entry) => entry.playerId === playerId)?.signal ?? null;

  const teammates: TeammateView[] = [];
  const opponents: OpponentView[] = [];
  for (const player of state.players) {
    if (player.id === self.id) continue;
    if (player.teamId === self.teamId) {
      teammates.push({ playerId: player.id, seat: player.seat, cardsRemaining: player.hand.length, lastSena: lastSenaFor(player.id) });
    } else {
      opponents.push({ playerId: player.id, teamId: player.teamId, seat: player.seat, cardsRemaining: player.hand.length });
    }
  }

  return {
    self: { playerId: self.id, teamId: self.teamId, seat: self.seat, hand: self.hand, lastSena: lastSenaFor(self.id) },
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
