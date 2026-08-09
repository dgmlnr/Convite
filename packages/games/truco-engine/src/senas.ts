import type { PlayerId } from "./ids.js";
import type { HandState, MatchState, Player } from "./match.js";

/**
 * Closed vocabulary of señas (design: "model the SIGNAL, not free-form
 * chat" — a closed vocabulary is both authentic to real Truco and the
 * reason this cannot become an abuse channel). These are the canonical
 * top-card signals: the two "matas" (as de espada, as de basto), the two
 * strong sevens (siete de espada, siete de oro), and the two envido-adjacent
 * cards (tres, dos) partners traditionally flash to each other.
 */
export const SENA_SIGNALS = ["asDeEspada", "asDeBasto", "sieteDeEspada", "sieteDeOro", "tres", "dos"] as const;
export type SenaSignal = (typeof SENA_SIGNALS)[number];

export interface SendSenaAction {
  readonly type: "send-sena";
  readonly playerId: PlayerId;
  readonly signal: SenaSignal;
}

export type SenaAction = SendSenaAction;

export type ApplySenaResult =
  | { readonly ok: true; readonly state: MatchState }
  | { readonly ok: false; readonly violation: string };

const findPlayer = (state: MatchState, playerId: PlayerId): Player | undefined =>
  state.players.find((player) => player.id === playerId);

/** A player may only signal if they HAVE a teammate — this is what keeps
 * señas naturally absent from every 1v1 match (design: partial 2v2 work must
 * be unreachable from the running product; gating on team size here means no
 * separate feature flag is needed for señas specifically to stay inert in
 * 1v1 — a 1v1 team, by construction, always has exactly one player). */
function hasTeammate(state: MatchState, player: Player): boolean {
  return state.players.some((other) => other.id !== player.id && other.teamId === player.teamId);
}

/** Señas are legal any time a hand is in progress and the sender has a
 * teammate — there is no card-ownership check (design: "a seña is a CLAIM,
 * not a verified statement; a player may signal a card they do not hold" —
 * bluffing through señas is part of the game and MUST NOT be validated away). */
export function getLegalSenaActions(state: MatchState, playerId: PlayerId): readonly SenaAction[] {
  const hand = state.hand;
  if (hand === null || hand.outcome.decided) return [];
  const player = findPlayer(state, playerId);
  if (player === undefined || !hasTeammate(state, player)) return [];
  return SENA_SIGNALS.map((signal) => ({ type: "send-sena", playerId, signal }));
}

function isLegalSena(state: MatchState, action: SenaAction): boolean {
  return getLegalSenaActions(state, action.playerId).some(
    (legal) => legal.playerId === action.playerId && legal.signal === action.signal,
  );
}

/** Pure reducer for señas: records the sender's latest signal, REPLACING any
 * earlier one from the same player this hand (a seña reflects current
 * intent, not a running log) — never mutates `state`. Never touches score or
 * any other rule state; señas are pure communication, not a game action with
 * consequences the engine enforces. */
export function applySenaAction(state: MatchState, action: SenaAction): ApplySenaResult {
  if (!isLegalSena(state, action)) {
    return { ok: false, violation: `illegal send-sena action: ${JSON.stringify(action)}` };
  }
  const hand = state.hand!;
  const player = findPlayer(state, action.playerId)!;

  const senas = [
    ...hand.senas.filter((entry) => entry.playerId !== action.playerId),
    { playerId: player.id, teamId: player.teamId, signal: action.signal },
  ];
  const nextHand: HandState = { ...hand, senas };
  return { ok: true, state: { ...state, hand: nextHand } };
}
