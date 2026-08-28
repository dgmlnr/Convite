import { applyOpeningEscoba, buildDeck, getMatchWinner } from "@hexdev/escoba-engine";
import type { Card, HandState, MatchState } from "@hexdev/escoba-engine";
import type { PlayerId, RandomSource } from "@hexdev/platform-contract";

/** No human actor submits this — mirrors `truco-module/src/deal.ts`'s own sentinel. */
export const SYSTEM_ACTOR_ID = "__system__" as PlayerId;

export interface StartHandAction {
  readonly type: "start-hand";
  readonly playerId: PlayerId;
  readonly deck: readonly Card[];
}

const CARDS_PER_PLAYER = 3;
const TABLE_OPENING_SIZE = 4;

/**
 * Fisher-Yates, mirrors `truco-module/src/deal.ts:26-33`. escoba-engine's
 * own `deal(state, rng)` shuffles AND materializes in one step with no seam
 * for a pre-built deck (design §D3 wants the WHOLE permutation carried as
 * replayable DATA on the action), so this module owns its own shuffle
 * instead — the same relationship `truco-module` already has with
 * `truco-engine`, not a new one.
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
 * Materializes a hand from an already-shuffled `deck` (art. 6.1: 3/player
 * round-robin, 4 to the table, remainder to stock) and applies the opening
 * escoba de muestra check via the engine's OWN exported `applyOpeningEscoba`
 * — only the split-by-index step is duplicated here, never the rules logic.
 * The engine's `deal()` shuffles internally and accepts no external deck, so
 * it cannot back a replayable system action (engine stays untouched). Dealer
 * rotates one seat per hand after the first, mirroring `truco-module`'s own
 * `rotateDealer` call site.
 */
export function startHand(state: MatchState, action: StartHandAction): MatchState {
  const seatCount = state.players.length;
  const dealerSeat = state.hand === null ? state.dealerSeat : (state.dealerSeat + 1) % seatCount;
  const hands: Card[][] = Array.from({ length: seatCount }, () => []);
  for (let round = 0; round < CARDS_PER_PLAYER; round += 1) {
    for (let seat = 0; seat < seatCount; seat += 1) hands[seat]!.push(action.deck[round * seatCount + seat]!);
  }
  const rest = action.deck.slice(seatCount * CARDS_PER_PLAYER);
  const players = state.players.map((player, seat) => ({ ...player, hand: hands[seat]! }));
  const table = rest.slice(0, TABLE_OPENING_SIZE);
  const stock = rest.slice(TABLE_OPENING_SIZE);
  const hand: HandState = {
    table,
    stock,
    piles: { [state.teams[0].id]: [], [state.teams[1].id]: [] },
    escobas: { [state.teams[0].id]: 0, [state.teams[1].id]: 0 },
    turn: players[(dealerSeat + 1) % seatCount]!.id,
    lastCapturer: null,
    outcome: null,
  };
  return applyOpeningEscoba({ ...state, players, dealerSeat, hand });
}
