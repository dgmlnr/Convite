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

/**
 * How many señas ONE PLAYER may send in ONE hand.
 *
 * THREE IS A PRODUCT DECISION, NOT A DERIVED NUMBER. It is not the size of the
 * vocabulary (six), nor the number of tricks, nor anything the rules imply —
 * it is a judgement call: three is enough to describe the three cards you
 * hold, and a fourth is the abuse this cap exists to price. Changing the
 * number is a one-line change HERE and nowhere else; nothing downstream may
 * hardcode a 3.
 *
 * WHY A CAP AT ALL. At a real table there is no limit on señas — but spending
 * them freely gets you SEEN by the opponent, and being read is the cost that
 * keeps the channel honest. The digital table lost that cost entirely, which
 * turned señas into a free, unlimited side channel. A per-hand cap puts a
 * price back on it.
 *
 * PER PLAYER, NEVER PER TEAM: a partner draining a shared allowance would be
 * frustrating and has no real-table analogue at all.
 *
 * Note this is a COUNT, never a clock. The engine is a pure deterministic
 * reducer with no time source and must not grow one — a per-hand quota needs
 * none, which is precisely why it was chosen over a rate limit between señas.
 */
export const MAX_SENAS_PER_HAND = 3;

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
/** Exported for `consult.ts`, which spends the SAME per-hand budget and so
 * has to ask the same two questions this file already answers: does this
 * player have anybody to talk to, and have they said enough this hand. One
 * owner for the quota, never a second copy of its arithmetic. */
export function hasTeammate(state: MatchState, player: Player): boolean {
  return state.players.some((other) => other.id !== player.id && other.teamId === player.teamId);
}

/** How many señas `playerId` has already SENT this hand.
 *
 * Read from `hand.senasSent` and NOT derivable from `hand.senas`: that array
 * keeps only the LATEST entry per player (`applySenaAction` replaces the
 * sender's earlier one), so its length counts SIGNALERS, never sends. Nor is
 * `SenaEvent.seq` a substitute — it is the hand's highest ordinal across ALL
 * senders, so one player's own ordinal already counts everyone else's señas
 * too. Hence a real per-player count in `HandState`. */
export function senasSentBy(hand: HandState, playerId: PlayerId): number {
  return hand.senasSent.find((entry) => entry.playerId === playerId)?.count ?? 0;
}

/** How many señas `playerId` may still send this hand — the number the UI
 * shows its own player, projected onto `PlayerView["self"]` and nowhere else
 * (see `getViewFor`).
 *
 * PURE QUOTA ARITHMETIC, deliberately: it does NOT fold in whether señas are
 * legal right now (no teammate, hand decided, no hand dealt). A 1v1 player,
 * who can never signal at all, still reads the full cap here — never 0 —
 * because 0 is the UI's "you spent them" state, and reporting it for a player
 * who never had them would make the señas affordance appear in 1v1, which is
 * exactly what `getLegalSenaActions` guarantees never happens. */
export function getSenasRemaining(state: MatchState, playerId: PlayerId): number {
  const hand = state.hand;
  if (hand === null) return MAX_SENAS_PER_HAND;
  return Math.max(0, MAX_SENAS_PER_HAND - senasSentBy(hand, playerId));
}

/** Señas are legal any time a hand is in progress, the sender has a teammate,
 * and they have not yet spent their per-hand quota (`MAX_SENAS_PER_HAND`).
 * There is no card-ownership check (design: "a seña is a CLAIM, not a verified
 * statement; a player may signal a card they do not hold" — bluffing through
 * señas is part of the game and MUST NOT be validated away).
 *
 * The cap limits HOW MANY, never WHICH: right up to the last seña of the quota
 * all six signals are still offered, and at the cap the whole list goes empty
 * at once. A cap that filtered the vocabulary instead would leak the sender's
 * own history into their options and quietly break the bluffing rule. */
export function getLegalSenaActions(state: MatchState, playerId: PlayerId): readonly SenaAction[] {
  const hand = state.hand;
  if (hand === null || hand.outcome.decided) return [];
  const player = findPlayer(state, playerId);
  if (player === undefined || !hasTeammate(state, player)) return [];
  if (getSenasRemaining(state, playerId) <= 0) return [];
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
 * consequences the engine enforces.
 *
 * The new entry's `seq` is taken from the hand's HIGHEST ordinal so far PLUS
 * ONE, and — the subtle part — that maximum is read BEFORE the sender's own
 * earlier entry is filtered out. Reading it after would let a player who is
 * the hand's only signaler re-use their own spent ordinal forever (filter
 * leaves `[]`, max falls back to 0, every re-send lands on 1 again), which is
 * precisely the "re-sent the same signal" case the ordinal exists to make
 * observable. Deterministic and clock-free: the ordinal is derived from the
 * state being reduced, never from wall time.
 *
 * The sender's `senasSent` count goes up by one on EVERY accepted send,
 * including a re-send of the same signal — that re-send costs quota exactly
 * like any other, and it is the case where `senas` alone would look unchanged.
 * An over-cap action never reaches this line: `isLegalSena` runs it through
 * `getLegalSenaActions`, the same legality path every other action uses, so
 * the cap needs no enforcement mechanism of its own. */
export function applySenaAction(state: MatchState, action: SenaAction): ApplySenaResult {
  if (!isLegalSena(state, action)) {
    return { ok: false, violation: `illegal send-sena action: ${JSON.stringify(action)}` };
  }
  const hand = state.hand!;
  const player = findPlayer(state, action.playerId)!;

  const seq = hand.senas.reduce((highest, entry) => Math.max(highest, entry.seq), 0) + 1;
  const senas = [
    ...hand.senas.filter((entry) => entry.playerId !== action.playerId),
    { playerId: player.id, teamId: player.teamId, signal: action.signal, seq },
  ];
  const senasSent = [
    ...hand.senasSent.filter((entry) => entry.playerId !== action.playerId),
    { playerId: player.id, count: senasSentBy(hand, player.id) + 1 },
  ];
  const nextHand: HandState = { ...hand, senas, senasSent };
  return { ok: true, state: { ...state, hand: nextHand } };
}
