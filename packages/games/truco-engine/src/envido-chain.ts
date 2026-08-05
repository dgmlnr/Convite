import type { Card, Rank, Suit } from "./card.js";
import type { PlayerId, TeamId } from "./ids.js";
import type { EnvidoCallLevel, EnvidoState, MatchState, Player } from "./match.js";

/** Envido point value of a rank: 1-7 count face value, 10/11/12 count zero. */
const ENVIDO_RANK_VALUE: Record<Rank, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 10: 0, 11: 0, 12: 0 };

/** Envido points for a hand: 20 + the two highest ranks of a shared suit, or
 * the single highest rank when no suit is shared (spec: envido rules). */
export function calculateEnvidoPoints(cards: readonly Card[]): number {
  const bySuit = new Map<Suit, number[]>();
  for (const card of cards) {
    bySuit.set(card.suit, [...(bySuit.get(card.suit) ?? []), ENVIDO_RANK_VALUE[card.rank]]);
  }
  let best = 0;
  for (const values of bySuit.values()) {
    if (values.length < 2) continue;
    const [highest, second] = [...values].sort((a, b) => b - a);
    best = Math.max(best, 20 + highest! + second!);
  }
  return best > 0 ? best : Math.max(...cards.map((card) => ENVIDO_RANK_VALUE[card.rank]));
}

export interface CallEnvidoAction {
  readonly type: "call-envido";
  readonly playerId: PlayerId;
  readonly level: EnvidoCallLevel;
}
export interface RespondEnvidoAction {
  readonly type: "respond-envido";
  readonly playerId: PlayerId;
  readonly response: "quiero" | "no-quiero";
}
/** Points are awarded at reveal, not at call time (spec). Legal once accepted; either player may submit it — it triggers computation, not a per-team choice. */
export interface RevealEnvidoAction {
  readonly type: "reveal-envido";
  readonly playerId: PlayerId;
}
export type EnvidoAction = CallEnvidoAction | RespondEnvidoAction | RevealEnvidoAction;

export type ApplyEnvidoResult =
  | { readonly ok: true; readonly state: MatchState }
  | { readonly ok: false; readonly violation: string };

/** Weight per level — envido calls may skip levels (envido -> real envido
 * directly), unlike the strictly-sequential truco chain. Falta envido is the
 * maximum weight, so it is always the final legal escalation. */
const ENVIDO_CALL_WEIGHT: Record<EnvidoCallLevel, number> = { envido: 1, envidoEnvido: 2, realEnvido: 3, faltaEnvido: 4 };
const ENVIDO_CALL_ORDER = Object.keys(ENVIDO_CALL_WEIGHT) as readonly EnvidoCallLevel[];
/** faltaEnvido has NO fixed value: its accepted value is `faltaEnvidoValue`
 * below, never summed. This sentinel must never be read — NaN makes an
 * accidental read fail loudly instead of silently producing a wrong score. */
const ENVIDO_CALL_VALUE: Record<EnvidoCallLevel, number> = { envido: 2, envidoEnvido: 2, realEnvido: 3, faltaEnvido: Number.NaN };

const sumValue = (calls: readonly EnvidoCallLevel[]): number => calls.reduce((sum, l) => sum + ENVIDO_CALL_VALUE[l], 0);
/** Decline concedes the value of calls strictly before the declined one, floored at 1 for a bare first call (spec).
 * This always excludes the declined call itself, so it never reads faltaEnvido's sentinel value even when falta is declined. */
const declineValue = (calls: readonly EnvidoCallLevel[]): number => Math.max(1, sumValue(calls.slice(0, -1)));

/** Falta envido's accepted value OVERRIDES the cumulative chain entirely: the
 * points the LEADING team needs to reach the match target (spec: "Falta
 * envido cost is dynamic"). NOT cumulative with prior calls — unlike real
 * envido / envido-envido, whose spec bullet explicitly says "accumulating",
 * falta envido's bullet deliberately omits that word. An earlier cumulative
 * implementation produced 37 instead of 6 for a 30-point target with a
 * 24-point leader; this is that regression's fix (see apply-progress). */
const faltaEnvidoValue = (state: MatchState): number =>
  state.config.pointsToWin - Math.max(...state.teams.map((team) => team.score));

const findPlayer = (state: MatchState, playerId: PlayerId): Player | undefined =>
  state.players.find((player) => player.id === playerId);

/** Envido-chain legality, mirroring the truco chain's `getLegalActions`.
 * Opening is gated on `truco.status === "none"`: the real interrupt-a-pending-truco rule needs card-play state this slice lacks (deferred to PR6); closest sound proxy now. */
export function getLegalEnvidoActions(state: MatchState, playerId: PlayerId): readonly EnvidoAction[] {
  const hand = state.hand;
  if (hand === null || findPlayer(state, playerId) === undefined) return [];
  const player = findPlayer(state, playerId)!;
  const envido = hand.envido;
  if (envido.status === "none") {
    return hand.truco.status === "none" ? [{ type: "call-envido", playerId, level: "envido" }] : [];
  }
  if (envido.status === "pending") {
    if (player.teamId === envido.callingTeamId) return [];
    const highest = Math.max(...envido.calls.map((level) => ENVIDO_CALL_WEIGHT[level]));
    const escalations: EnvidoAction[] = ENVIDO_CALL_ORDER.filter((level) => ENVIDO_CALL_WEIGHT[level] > highest).map((level) => ({ type: "call-envido", playerId, level }));
    return [{ type: "respond-envido", playerId, response: "quiero" }, { type: "respond-envido", playerId, response: "no-quiero" }, ...escalations];
  }
  if (envido.status === "accepted") return [{ type: "reveal-envido", playerId }];
  return []; // "declined" or "revealed" — envido is done for this hand.
}

function envidoActionsEqual(a: EnvidoAction, b: EnvidoAction): boolean {
  if (a.type !== b.type || a.playerId !== b.playerId) return false;
  if (a.type === "call-envido" && b.type === "call-envido") return a.level === b.level;
  if (a.type === "respond-envido" && b.type === "respond-envido") return a.response === b.response;
  return a.type === "reveal-envido";
}

const isLegalEnvido = (state: MatchState, action: EnvidoAction): boolean =>
  getLegalEnvidoActions(state, action.playerId).some((legal) => envidoActionsEqual(legal, action));

/** Winner of the envido reveal: higher points wins; a tie is won by the mano's team.
 * INFERENCE — spec doesn't state the tie-break; mirrors hand-winner's ("parda") mano tie-break. */
function resolveEnvidoWinner(state: MatchState, manoSeat: number): TeamId {
  let winner: { teamId: TeamId; points: number; isMano: boolean } | null = null;
  for (const team of state.teams) {
    const teamPlayer = state.players.find((player) => player.teamId === team.id)!;
    const points = calculateEnvidoPoints(teamPlayer.hand);
    const isMano = teamPlayer.seat === manoSeat;
    if (winner === null || points > winner.points || (points === winner.points && isMano)) winner = { teamId: team.id, points, isMano };
  }
  return winner!.teamId;
}

/** Pure reducer for the envido call chain: never mutates `state`; illegal actions rejected via `{ok:false}`. */
export function applyEnvidoAction(state: MatchState, action: EnvidoAction): ApplyEnvidoResult {
  if (!isLegalEnvido(state, action)) {
    return { ok: false, violation: `illegal envido action: ${JSON.stringify(action)}` };
  }
  const hand = state.hand!;
  const player = findPlayer(state, action.playerId)!;
  if (action.type === "call-envido") {
    const priorCalls = hand.envido.status === "pending" ? hand.envido.calls : [];
    const envido: EnvidoState = { status: "pending", calls: [...priorCalls, action.level], callingTeamId: player.teamId };
    return { ok: true, state: { ...state, hand: { ...hand, envido } } };
  }

  if (action.type === "respond-envido") {
    const pending = hand.envido as Extract<EnvidoState, { status: "pending" }>;
    if (action.response === "quiero") {
      const isFalta = pending.calls[pending.calls.length - 1] === "faltaEnvido";
      const acceptedValue = isFalta ? faltaEnvidoValue(state) : sumValue(pending.calls);
      const envido: EnvidoState = { status: "accepted", calls: pending.calls, callingTeamId: pending.callingTeamId, acceptedValue };
      return { ok: true, state: { ...state, hand: { ...hand, envido } } };
    }
    const awarded = declineValue(pending.calls);
    const envido: EnvidoState = { status: "declined", calls: pending.calls, callingTeamId: pending.callingTeamId, decliningTeamId: player.teamId };
    const teams = state.teams.map((team) => (team.id === pending.callingTeamId ? { ...team, score: team.score + awarded } : team));
    return { ok: true, state: { ...state, teams, hand: { ...hand, envido } } };
  }

  const accepted = hand.envido as Extract<EnvidoState, { status: "accepted" }>;
  const winningTeamId = resolveEnvidoWinner(state, hand.manoSeat);
  const envido: EnvidoState = { status: "revealed", calls: accepted.calls, winningTeamId, awardedValue: accepted.acceptedValue };
  const teams = state.teams.map((team) => (team.id === winningTeamId ? { ...team, score: team.score + accepted.acceptedValue } : team));
  return { ok: true, state: { ...state, teams, hand: { ...hand, envido } } };
}
