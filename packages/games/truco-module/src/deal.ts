import { buildDeck, getMatchWinner } from "@hexdev/truco-engine";
import type { Card, DealInput, MatchState } from "@hexdev/truco-engine";
import type { PlayerId, RandomSource } from "@hexdev/platform-contract";

/** `GameModule`'s `TAction` bound requires `{ playerId: PlayerId }`
 * structurally (see apply-progress). `start-hand` has no human actor — a
 * SYSTEM action, never legitimately client-submitted — so this sentinel
 * only satisfies the type bound. Incidental bonus: it never matches a real
 * seated player's id, so the room's actor-mismatch check still rejects a
 * client-forged `start-hand` — not a substitute for real system-action
 * gating (this file IS that gating, wired in by `transport-colyseus`). */
export const SYSTEM_ACTOR_ID = "__system__" as PlayerId;

export interface StartHandAction {
  readonly type: "start-hand";
  readonly playerId: PlayerId;
  readonly deal: DealInput;
}

const CARDS_PER_HAND = 3;

/** Fisher-Yates over the real 40-card deck, driven entirely by the injected
 * `rng` — this module never calls `Math.random`/Web Crypto itself. The
 * engine never randomizes (design §4); this is the one seam, one layer up,
 * that turns externally-supplied entropy into a materialized deal. */
function shuffledDeck(rng: RandomSource): Card[] {
  const deck = [...buildDeck()];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

/**
 * Builds a `SystemActionRequester` (`platform-core`'s registry shape) for a
 * fixed seat count: "nobody can act, but the match must advance" happens
 * exactly when no hand exists yet or the last one has been decided, and the
 * match has no winner yet. Returns `null` otherwise — a hand in progress or
 * an already-won match needs no system action, and the caller (the generic
 * `MatchRoom`) must treat `null` as "nothing to do", never re-deal on a whim.
 *
 * Parametrized over `seatCount` (obs 2927/2925's own named gap — this file
 * used to hardcode `SEAT_COUNT = 2`) so `requestSystemAction` (1v1) and
 * `requestSystemAction2v2` below are the SAME dealing logic, never two
 * parallel implementations that could drift.
 */
function createSystemActionRequester(seatCount: number): (state: MatchState, rng: RandomSource) => StartHandAction | null {
  return (state, rng) => {
    if (getMatchWinner(state) !== null) return null;
    if (state.hand !== null && !state.hand.outcome.decided) return null;
    const deck = shuffledDeck(rng);
    const deal: DealInput = Array.from({ length: seatCount }, (_, seat) => deck.slice(seat * CARDS_PER_HAND, seat * CARDS_PER_HAND + CARDS_PER_HAND));
    return { type: "start-hand", playerId: SYSTEM_ACTOR_ID, deal };
  };
}

export const requestSystemAction = createSystemActionRequester(2);

/** The 2v2 module's own dealer: identical shuffle/deal logic, four hands
 * instead of two — paired with `trucoModule2v2` in the registry, exactly the
 * way `requestSystemAction` is paired with `trucoModule` (never a
 * `platform-contract` port member, per this file's own top-level docstring). */
export const requestSystemAction2v2 = createSystemActionRequester(4);
