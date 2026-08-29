import type { Card } from "./card.js";
import type { PlayerId, TeamId } from "./ids.js";
import type { MatchState } from "./state.js";

/**
 * Every other player, teammate or opponent — merged (unlike truco-engine's
 * `TeammateView`/`OpponentView` split) because escoba has no señas to
 * guard (design §D3: no consult channel at all). Hand contents are hidden
 * from EVERY other player; capture piles are the public memory instead.
 */
export interface OtherPlayerView {
  readonly playerId: PlayerId;
  readonly teamId: TeamId;
  readonly seat: number;
  readonly cardsRemaining: number;
}

/**
 * No field here can structurally hold the stock — design §D2: "a
 * redaction bug is a COMPILE ERROR, not a runtime leak" (same discipline
 * `truco-engine/src/view.ts` documents for señas). `table`/`piles`/
 * `escobas` are public in full; only the never-seen stock is redacted to
 * a bare count.
 */
export interface HandView {
  readonly table: readonly Card[];
  readonly piles: Readonly<Record<TeamId, readonly Card[]>>;
  readonly escobas: Readonly<Record<TeamId, number>>;
  readonly turn: PlayerId;
  readonly stockCount: number;
}

export interface PlayerView {
  readonly self: {
    readonly playerId: PlayerId;
    readonly teamId: TeamId;
    readonly seat: number;
    readonly hand: readonly Card[];
  };
  readonly others: readonly OtherPlayerView[];
  readonly teams: readonly { readonly id: TeamId; readonly score: number }[];
  readonly hand: HandView | null;
  readonly dealerSeat: number;
}

/**
 * Per-player projection (design §D2). Every field is built explicitly from
 * primitives — never spread from `Player`/`MatchState`/`HandState` — so a
 * stock card can never reach the return value by accident.
 */
export function getViewFor(state: MatchState, playerId: PlayerId): PlayerView {
  const self = state.players.find((player) => player.id === playerId);
  if (self === undefined) {
    throw new Error(`unknown player: ${playerId}`);
  }

  const others: OtherPlayerView[] = state.players
    .filter((player) => player.id !== self.id)
    .map((player) => ({ playerId: player.id, teamId: player.teamId, seat: player.seat, cardsRemaining: player.hand.length }));

  return {
    self: { playerId: self.id, teamId: self.teamId, seat: self.seat, hand: self.hand },
    others,
    teams: state.teams.map((team) => ({ id: team.id, score: team.score })),
    hand:
      state.hand === null
        ? null
        : {
            table: state.hand.table,
            piles: state.hand.piles,
            escobas: state.hand.escobas,
            turn: state.hand.turn,
            // THE FENCE (mutation row 6): only the LENGTH crosses this
            // boundary — `HandView` has no field that could hold the
            // array. A leak through some OTHER field is what
            // `view.test.ts`'s JSON scan additionally guards against.
            stockCount: state.hand.stock.length,
          },
    dealerSeat: state.dealerSeat,
  };
}
