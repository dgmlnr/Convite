import { buildDeck, deal, getMatchWinner } from "@hexdev/escoba-engine";
import type { Card, MatchState } from "@hexdev/escoba-engine";
import type { PlayerId, RandomSource } from "@hexdev/platform-contract";

/** No human actor submits this — mirrors `truco-module/src/deal.ts`'s own sentinel. */
export const SYSTEM_ACTOR_ID = "__system__" as PlayerId;

export interface StartHandAction {
  readonly type: "start-hand";
  readonly playerId: PlayerId;
  readonly deck: readonly Card[];
}

/**
 * Fisher-Yates, mirrors `truco-module/src/deal.ts:26-33`. Shuffling belongs
 * HERE, not in the engine: this module owns the entropy (`RandomSource`
 * comes from the host) and design §D3 wants the whole 40-card permutation
 * carried as replayable DATA on the `start-hand` action. The engine's own
 * `deal(state, deck)` only MATERIALIZES an already-shuffled deck — the same
 * split `truco-module` already has with `truco-engine`, not a new one.
 */
function shuffledDeck(rng: RandomSource): Card[] {
  const deck = [...buildDeck()];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

/**
 * design §D3: fires on the same gate `match-room.ts:1023` uses for truco —
 * no hand dealt yet, or the last one settled, and the match has no winner.
 * `hand.outcome` starts `null` from `startHand` below and is only ever set
 * to `{decided: true}` by `settleHandIfNeeded` (./index.ts) at genuine hand
 * end — the field escoba-engine's own `state.ts` left vestigial.
 */
export function requestEscobaSystemAction(state: MatchState, rng: RandomSource): StartHandAction | null {
  if (getMatchWinner(state) !== null) return null;
  if (state.hand !== null && (state.hand.outcome === null || !state.hand.outcome.decided)) return null;
  return { type: "start-hand", playerId: SYSTEM_ACTOR_ID, deck: shuffledDeck(rng) };
}

/**
 * Materializes a hand from an already-shuffled `deck` by delegating to the
 * engine's own `deal(state, deck)` — art. 6.1's round-robin split, the
 * table/stock cut, and the opening escoba de muestra check (16.1/16.2) all
 * live in exactly ONE place, escoba-engine, never duplicated here. This
 * module rotates the dealer seat first (one seat per hand, after the first
 * — mirroring `truco-module`'s own `rotateDealer` call site) and lets the
 * engine do everything else.
 */
export function startHand(state: MatchState, action: StartHandAction): MatchState {
  const dealerSeat = state.hand === null ? state.dealerSeat : (state.dealerSeat + 1) % state.players.length;
  return deal({ ...state, dealerSeat }, action.deck);
}
