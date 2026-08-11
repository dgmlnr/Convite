import type { Card, Rank, Suit } from "./card.js";
import type { PlayerId } from "./ids.js";
import type { CallEvent, EnvidoCallLevel, EnvidoDeclaration, EnvidoState, HandState, MatchState, Player } from "./match.js";

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

/** Envido may only be OPENED during the FIRST trick, before that trick's
 * second card is played (spec is silent on the exact boundary; verified
 * against real Truco Argentino convention — ludoteka.com, trucogame.com,
 * timbax.com, folkloretradiciones.com.ar, trucobits.com — all consistent).
 * This REPLACES the earlier `truco.status === "none"` simplification
 * (PR5/PR6/PR7): envido now correctly interrupts a PENDING or ACCEPTED truco
 * call, as long as it is still the first trick and the opener has not yet
 * played their own card. A truco DECLINE still blocks opening — it already
 * ended the hand, independent of trick position.
 * INFERENCE, explicitly flagged: this does not additionally require "mano
 * acts before pie may open" as a strict turn-order rule gated on
 * `hand.turnSeat`. Two reasons: (1) `turnSeat` only advances on card play,
 * never on calls, so gating on it would incorrectly block a pie
 * response-by-envido to a still-pending mano truco call — exactly the
 * scenario this fix is meant to unlock; (2) no OTHER call in this engine is
 * turn-gated either (`getLegalTrucoActions` lets either player make the
 * first truco call), so this stays consistent with that existing
 * convention rather than inventing a new one. */
function canOpenEnvido(hand: HandState, player: Player): boolean {
  if (hand.truco.status === "declined") return false; // hand already ended by a truco decline
  if (hand.trickOutcomes.length > 0) return false; // first trick already resolved — never legal in trick 2/3
  return !hand.currentTrickPlays.some((play) => play.playerId === player.id); // opener must not have played their own card yet
}

/** Envido-chain legality, mirroring the truco chain's `getLegalActions`. */
export function getLegalEnvidoActions(state: MatchState, playerId: PlayerId): readonly EnvidoAction[] {
  const hand = state.hand;
  if (hand === null || hand.outcome.decided || findPlayer(state, playerId) === undefined) return [];
  const player = findPlayer(state, playerId)!;
  const envido = hand.envido;
  if (envido.status === "none") {
    return canOpenEnvido(hand, player) ? [{ type: "call-envido", playerId, level: "envido" }] : [];
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

/** Per-player declaration order at envido reveal, in mano rotation
 * (`manoSeat`, `manoSeat+1`, …, mod `players.length` — spec: "Per-Player
 * Envido Declaration Order"). Mano always declares their own points — there
 * is no running best yet to compare against. Each LATER player declares
 * their own points ONLY IF strictly greater than the best already declared;
 * otherwise the entry is `sonBuenas` and the withheld number is NEVER
 * COMPUTED INTO the entry at all (D-1) — there is nothing to redact at
 * projection, because nothing withheld was ever written down.
 *
 * AMENDMENT (post-design, supersedes design D-3's lexicographic
 * `(points, isManoTeam)` comparator): the comparator below is plain
 * strictly-greater on points alone — `points > runningBest`, no
 * mano-priority term. Weakening this to `>=` changes WHO declares at a tie
 * (a game-rule concern, fenced by T-3/T-4) but — verified by manual mutation
 * during T-5m — does NOT leak a withheld number: every push below still
 * either builds a fully-typed `"points"` object or a fully-typed
 * `"sonBuenas"` object, so a would-be leak needs an actual out-of-band
 * assignment (e.g. an unsafe cast), not a comparator change. THAT is the
 * mutation view.test.ts's T-5 property is fenced against; see this test
 * file's own T-5m comment for the exact mutation performed and its result.
 * `resolveEnvidoWinner`'s replacement is DERIVED from this list
 * (D-2, unchanged): the team of the LAST entry whose
 * `declaration === "points"`. In the 2v2 corner where two players from
 * different teams tie for the max and neither is the mano seat, the earlier
 * declarer (closer to mano) now wins the derived tie — not mano's team, as
 * the pre-amendment `(points, isManoTeam)` comparator would have produced.
 * 1v1 is unaffected: mano is definitionally the earliest declarer, so an
 * equal later opponent still withholds and mano's team still wins the tie —
 * identical to today (see envido-chain.test.ts's "a tied reveal is won by
 * the mano's team", unmodified by this amendment).
 *
 * Module-exported (not package-exported — `index.ts` re-exports only the
 * `EnvidoDeclaration` TYPE, never this function, design checklist item 1) so
 * this file's own tests can exercise it directly, without needing a full
 * call/quiero/reveal chain first. */
export function resolveEnvidoDeclarations(state: MatchState, manoSeat: number): readonly EnvidoDeclaration[] {
  const playerCount = state.players.length;
  const rotation = Array.from({ length: playerCount }, (_, i) => (manoSeat + i) % playerCount).map(
    (seat) => state.players.find((player) => player.seat === seat)!,
  );

  const declarations: EnvidoDeclaration[] = [];
  let runningBest = -Infinity;
  for (const player of rotation) {
    const points = calculateEnvidoPoints(player.hand);
    if (points > runningBest) {
      declarations.push({ declaration: "points", playerId: player.id, teamId: player.teamId, seat: player.seat, points });
      runningBest = points;
    } else {
      declarations.push({ declaration: "sonBuenas", playerId: player.id, teamId: player.teamId, seat: player.seat });
    }
  }
  return declarations;
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
    const event: CallEvent = { kind: "envido-call", playerId: player.id, teamId: player.teamId, seat: player.seat, level: action.level };
    return { ok: true, state: { ...state, hand: { ...hand, envido, callEvents: [...hand.callEvents, event] } } };
  }

  if (action.type === "respond-envido") {
    const pending = hand.envido as Extract<EnvidoState, { status: "pending" }>;
    if (action.response === "quiero") {
      const isFalta = pending.calls[pending.calls.length - 1] === "faltaEnvido";
      const acceptedValue = isFalta ? faltaEnvidoValue(state) : sumValue(pending.calls);
      const envido: EnvidoState = { status: "accepted", calls: pending.calls, callingTeamId: pending.callingTeamId, acceptedValue };
      const event: CallEvent = { kind: "envido-response", playerId: player.id, teamId: player.teamId, seat: player.seat, response: "quiero" };
      return { ok: true, state: { ...state, hand: { ...hand, envido, callEvents: [...hand.callEvents, event] } } };
    }
    const awarded = declineValue(pending.calls);
    const envido: EnvidoState = { status: "declined", calls: pending.calls, callingTeamId: pending.callingTeamId, decliningTeamId: player.teamId };
    const event: CallEvent = { kind: "envido-response", playerId: player.id, teamId: player.teamId, seat: player.seat, response: "no-quiero" };
    const teams = state.teams.map((team) => (team.id === pending.callingTeamId ? { ...team, score: team.score + awarded } : team));
    return { ok: true, state: { ...state, teams, hand: { ...hand, envido, callEvents: [...hand.callEvents, event] } } };
  }

  const accepted = hand.envido as Extract<EnvidoState, { status: "accepted" }>;
  // D-2: `winningTeamId` is DERIVED from the declaration list, computed once
  // here — the team of the LAST entry whose `declaration === "points"`. Mano
  // always declares (see `resolveEnvidoDeclarations`), so that entry always
  // exists. This REPLACES the pre-amendment per-team max+isMano scan: "who
  // declared the highest number" and "who won" are now a structural fact of
  // one function, not a coincidence two independent functions had to agree on.
  const declarations = resolveEnvidoDeclarations(state, hand.manoSeat);
  const winningTeamId = [...declarations].reverse().find((entry) => entry.declaration === "points")!.teamId;
  const envido: EnvidoState = { status: "revealed", calls: accepted.calls, winningTeamId, awardedValue: accepted.acceptedValue, declarations };
  // Marker-only event: no points, no winner (D-1/D-5). The numbers stay
  // confined to the structurally-redacted `declarations` list inside
  // `envido` above — the log itself never carries one.
  const event: CallEvent = { kind: "envido-reveal", playerId: player.id, teamId: player.teamId, seat: player.seat };
  const teams = state.teams.map((team) => (team.id === winningTeamId ? { ...team, score: team.score + accepted.acceptedValue } : team));
  return { ok: true, state: { ...state, teams, hand: { ...hand, envido, callEvents: [...hand.callEvents, event] } } };
}
