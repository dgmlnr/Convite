import { cardId } from "./card.js";
import type { Card } from "./card.js";
import { resolveHandWinner } from "./hand-winner.js";
import type { HandOutcome } from "./hand-winner.js";
import type { PlayerId } from "./ids.js";
import type { HandPlay, HandState, MatchState, Player } from "./match.js";
import { resolveTrick } from "./trick.js";
import type { TrickOutcome } from "./trick.js";
import { ACCEPTED_HAND_VALUE } from "./truco-scoring.js";

export interface PlayCardAction {
  readonly type: "play-card";
  readonly playerId: PlayerId;
  readonly card: Card;
}

export type ApplyCardPlayResult =
  | { readonly ok: true; readonly state: MatchState }
  | { readonly ok: false; readonly violation: string };

const findPlayer = (state: MatchState, playerId: PlayerId): Player | undefined =>
  state.players.find((player) => player.id === playerId);

/** A pending truco/envido call, or an accepted-but-unrevealed envido, pauses
 * trick play — mirrors the existing envido-blocks-truco ordering gate. Real
 * Truco requires calls to be resolved before play continues. */
function callsAreSettled(hand: HandState): boolean {
  if (hand.truco.status === "pending") return false;
  if (hand.envido.status === "pending" || hand.envido.status === "accepted") return false;
  return true;
}

/** Legal play-card actions: only the player at `hand.turnSeat`, only cards
 * still in their own hand, only while no call is pending and the hand isn't
 * already decided. `getLegalActions` is the single source of legality. */
export function getLegalCardPlayActions(state: MatchState, playerId: PlayerId): readonly PlayCardAction[] {
  const hand = state.hand;
  if (hand === null || hand.outcome.decided || hand.truco.status === "declined") return [];
  const player = findPlayer(state, playerId);
  if (player === undefined || player.seat !== hand.turnSeat || !callsAreSettled(hand)) return [];
  return player.hand.map((card) => ({ type: "play-card", playerId, card }));
}

function isLegalCardPlay(state: MatchState, action: PlayCardAction): boolean {
  return getLegalCardPlayActions(state, action.playerId).some((legal) => cardId(legal.card) === cardId(action.card));
}

function handValue(hand: HandState): number {
  return hand.truco.status === "accepted" ? ACCEPTED_HAND_VALUE[hand.truco.level] : 1;
}

/** Who leads the NEXT trick — INFERENCE, spec is silent on turn order after a
 * trick resolves. Standard Truco Argentino rule: the trick's winner leads
 * next; on a parda (tie), the same player who led the tied trick leads again. */
function nextLeaderSeat(leaderSeat: number, outcome: TrickOutcome, state: MatchState): number {
  if (outcome.winnerTeamId === null) return leaderSeat;
  return state.players.find((player) => player.teamId === outcome.winnerTeamId)!.seat;
}

/** Pure reducer for card play: validates turn/ownership, advances the trick
 * via `resolveTrick`, and closes the hand via `resolveHandWinner`, awarding
 * the truco-level value to the winning team. Never mutates `state`. */
export function applyCardPlayAction(state: MatchState, action: PlayCardAction): ApplyCardPlayResult {
  if (!isLegalCardPlay(state, action)) {
    return { ok: false, violation: `illegal play-card action: ${JSON.stringify(action)}` };
  }
  const hand = state.hand!;
  const player = findPlayer(state, action.playerId)!;

  const players = state.players.map((p) =>
    p.id === player.id ? { ...p, hand: p.hand.filter((c) => cardId(c) !== cardId(action.card)) } : p,
  );
  const play: HandPlay = { playerId: player.id, teamId: player.teamId, seat: player.seat, card: action.card };
  const plays: readonly HandPlay[] = [...hand.currentTrickPlays, play];

  if (plays.length < 2) {
    const nextTurnSeat = state.players.find((p) => p.id !== player.id)!.seat;
    return { ok: true, state: { ...state, players, hand: { ...hand, currentTrickPlays: plays, turnSeat: nextTurnSeat } } };
  }

  const [first, second] = plays as readonly [HandPlay, HandPlay];
  const outcome = resolveTrick([
    { teamId: first.teamId, card: first.card },
    { teamId: second.teamId, card: second.card },
  ]);
  const trickOutcomes = [...hand.trickOutcomes, outcome];
  const manoTeamId = state.players.find((p) => p.seat === hand.manoSeat)!.teamId;
  const handOutcome: HandOutcome = resolveHandWinner(trickOutcomes, manoTeamId);
  const nextTurnSeat = nextLeaderSeat(first.seat, outcome, state);
  const nextHand: HandState = { ...hand, currentTrickPlays: [], trickOutcomes, turnSeat: nextTurnSeat, outcome: handOutcome };

  if (!handOutcome.decided) {
    return { ok: true, state: { ...state, players, hand: nextHand } };
  }

  const awardedValue = handValue(hand);
  const teams = state.teams.map((team) =>
    team.id === handOutcome.winnerTeamId ? { ...team, score: team.score + awardedValue } : team,
  );
  return { ok: true, state: { ...state, teams, players, hand: nextHand } };
}
