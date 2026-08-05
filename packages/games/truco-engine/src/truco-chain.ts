import { applyCardPlayAction, getLegalCardPlayActions } from "./card-play.js";
import type { PlayCardAction } from "./card-play.js";
import { applyEnvidoAction, getLegalEnvidoActions } from "./envido-chain.js";
import type { EnvidoAction } from "./envido-chain.js";
import type { PlayerId } from "./ids.js";
import { getMatchWinner } from "./match.js";
import type { MatchState, Player, TrucoCallLevel, TrucoState } from "./match.js";

export interface CallTrucoAction {
  readonly type: "call-truco";
  readonly playerId: PlayerId;
  readonly level: TrucoCallLevel;
}

export interface RespondTrucoAction {
  readonly type: "respond-truco";
  readonly playerId: PlayerId;
  readonly response: "quiero" | "no-quiero";
}

/** The truco call-chain's own actions; `Action` below is the widened union. */
export type TrucoAction = CallTrucoAction | RespondTrucoAction;

/** Every action the reducer pair accepts (spec: "Pure, Deterministic Engine API"). PR5 widened truco-only to truco+envido; this card-play slice widens it again the same way, never forking a parallel reducer. */
export type Action = TrucoAction | EnvidoAction | PlayCardAction;

export type ApplyResult =
  | { readonly ok: true; readonly state: MatchState }
  | { readonly ok: false; readonly violation: string };

const NEXT_LEVEL: Record<TrucoCallLevel, TrucoCallLevel | null> = {
  truco: "retruco",
  retruco: "valeCuatro",
  valeCuatro: null,
};

/** Points conceded on a decline: the last ACCEPTED level's value, or the
 * base 1-point hand value for a first call. Escalation is strictly
 * sequential, so this is a static function of the declined level alone. */
const DECLINE_VALUE: Record<TrucoCallLevel, number> = {
  truco: 1,
  retruco: 2,
  valeCuatro: 3,
};

function findPlayer(state: MatchState, playerId: PlayerId): Player | undefined {
  return state.players.find((player) => player.id === playerId);
}

function actionsEqual(a: TrucoAction, b: TrucoAction): boolean {
  if (a.type !== b.type || a.playerId !== b.playerId) {
    return false;
  }
  if (a.type === "call-truco" && b.type === "call-truco") {
    return a.level === b.level;
  }
  if (a.type === "respond-truco" && b.type === "respond-truco") {
    return a.response === b.response;
  }
  return false;
}

/** Truco-chain legality. Ordering gate (spec: "Envido must resolve before any
 * truco call proceeds"): while envido is unresolved (`pending` or
 * `accepted`-awaiting-reveal), no truco action is legal for anyone. */
function getLegalTrucoActions(state: MatchState, playerId: PlayerId): readonly TrucoAction[] {
  const hand = state.hand;
  if (hand === null) {
    return [];
  }

  const player = findPlayer(state, playerId);
  if (player === undefined) {
    return [];
  }

  if (hand.envido.status === "pending" || hand.envido.status === "accepted") return [];
  if (hand.outcome.decided) return []; // hand already decided by card play — nothing further is legal

  const truco = hand.truco;

  if (truco.status === "none") {
    return [{ type: "call-truco", playerId, level: "truco" }];
  }

  if (truco.status === "pending") {
    if (player.teamId === truco.callingTeamId) {
      return [];
    }
    return [
      { type: "respond-truco", playerId, response: "quiero" },
      { type: "respond-truco", playerId, response: "no-quiero" },
    ];
  }

  if (truco.status === "accepted") {
    if (player.teamId === truco.callingTeamId) {
      return [];
    }
    const next = NEXT_LEVEL[truco.level];
    return next === null ? [] : [{ type: "call-truco", playerId, level: next }];
  }

  return []; // "declined" — hand is over, nothing further is legal.
}

/** Merged legal-action surface (truco + envido); `applyAction` rejects
 * anything not present here. Once the match has a winner, nothing further is
 * legal for either player (spec: "Match and Hand Termination"). */
export function getLegalActions(state: MatchState, playerId: PlayerId): readonly Action[] {
  if (getMatchWinner(state) !== null) {
    return [];
  }
  return [
    ...getLegalTrucoActions(state, playerId),
    ...getLegalEnvidoActions(state, playerId),
    ...getLegalCardPlayActions(state, playerId),
  ];
}

function isLegalTruco(state: MatchState, action: TrucoAction): boolean {
  return getLegalTrucoActions(state, action.playerId).some((legal) => actionsEqual(legal, action));
}

function applyTrucoAction(state: MatchState, action: TrucoAction): ApplyResult {
  if (!isLegalTruco(state, action)) {
    return { ok: false, violation: `illegal truco action: ${JSON.stringify(action)}` };
  }

  const hand = state.hand;
  if (hand === null) {
    return { ok: false, violation: "no hand in progress" };
  }
  const player = findPlayer(state, action.playerId);
  if (player === undefined) {
    return { ok: false, violation: `unknown player: ${action.playerId}` };
  }

  if (action.type === "call-truco") {
    // Covers both the hand's first call ("none" -> "pending") and an
    // escalation ("accepted" -> "pending"): in both cases the caller
    // becomes the new pending caller at the new level.
    const nextTruco: TrucoState = { status: "pending", level: action.level, callingTeamId: player.teamId };
    return { ok: true, state: { ...state, hand: { ...hand, truco: nextTruco } } };
  }

  const pending = hand.truco;
  if (pending.status !== "pending") {
    return { ok: false, violation: "no pending truco call to respond to" };
  }

  if (action.response === "quiero") {
    const nextTruco: TrucoState = { status: "accepted", level: pending.level, callingTeamId: pending.callingTeamId };
    return { ok: true, state: { ...state, hand: { ...hand, truco: nextTruco } } };
  }

  const nextTruco: TrucoState = {
    status: "declined",
    level: pending.level,
    callingTeamId: pending.callingTeamId,
    decliningTeamId: player.teamId,
  };
  const awardedPoints = DECLINE_VALUE[pending.level];
  const teams = state.teams.map((team) =>
    team.id === pending.callingTeamId ? { ...team, score: team.score + awardedPoints } : team,
  );

  return { ok: true, state: { ...state, teams, hand: { ...hand, truco: nextTruco } } };
}

/** Pure reducer for the whole engine. Never mutates `state`; dispatches to the
 * truco, envido, or card-play chain by `action.type` — the SAME reducer pair,
 * not parallel reducers. */
export function applyAction(state: MatchState, action: Action): ApplyResult {
  if (action.type === "call-truco" || action.type === "respond-truco") return applyTrucoAction(state, action);
  if (action.type === "play-card") return applyCardPlayAction(state, action);
  return applyEnvidoAction(state, action);
}
