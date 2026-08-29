import type { Card } from "./card.js";
import { cardValue } from "./values.js";
import type { PlayerId } from "./ids.js";
import type { MatchState } from "./state.js";
import type { PlayCardAction } from "./capture.js";

const FIFTEEN = 15;

/**
 * Every subset of `table` whose capture-value sum equals `target`,
 * expressed as the actual TABLE CARDS — never just values, since the
 * table can hold several cards of the same value (e.g. two 5s of
 * different suits) and each is a physically distinct capture choice.
 *
 * Canonical order (table-index lexicographic, design §D4/M): a
 * depth-first walk over table indices 0..n-1 that always tries INCLUDING
 * the current index before excluding it, so a subset that includes a
 * lower table index is always emitted before one that omits it. Two
 * calls against the same table+target therefore always return the
 * identical sequence — required for `getLegalActions`'s own determinism
 * ("so `toContainEqual` and any golden are stable", design §D4).
 */
function summingSubsets(table: readonly Card[], target: number): readonly (readonly Card[])[] {
  const subsets: Card[][] = [];
  const chosen: Card[] = [];

  function walk(index: number, remaining: number): void {
    if (remaining === 0) {
      subsets.push([...chosen]);
      return;
    }
    if (remaining < 0 || index >= table.length) return;
    const tableCard = table[index]!;
    chosen.push(tableCard);
    walk(index + 1, remaining - cardValue(tableCard));
    chosen.pop();
    walk(index + 1, remaining);
  }

  if (target >= 0) walk(0, target);
  return subsets;
}

/**
 * design §D4/M. Enumerates ONE action per (hand card x valid summing
 * subset); a card with NO summing subset gets exactly one stay-on-table
 * action instead of zero — capture and stay-on-table are MUTUALLY
 * EXCLUSIVE per played card, the same invariant `capture.ts`'s
 * `applyAction` enforces (mutation row 8 guards this). The total emitted
 * is `sum over hand cards of max(subsetCount(card), 1)`, which is why
 * this can NEVER be empty for a player who holds at least one card — a
 * player holding only cards that form no 15 still gets one legal move
 * per card. Without that, such a player could not move and the room
 * would hang with no error.
 *
 * `conformance.ts:105-111` requires a bot to choose from exactly what
 * this offers, and `BotStrategy.chooseAction` gets its whole option
 * space from this call, so the enumeration above is forced, not chosen.
 *
 * Bounded regardless of table size by the deck's own structural parity
 * ceiling (design §M1, `escoba/invariante-de-paridad-de-la-mesa`): the
 * table holds at most 20 cards, so the measured worst case is 942
 * actions (4 seats) / 882 (2 seats) — see `legal-actions.bound.test.ts`.
 * That bound is an ASSERTION, not a truncation: this function never caps
 * its own output; mutation row 9 guards the mechanism the bound depends
 * on — a capture that failed to fully remove the played card from the
 * table would let it grow past that ceiling over a long match.
 */
export function getLegalActions(state: MatchState, playerId: PlayerId): readonly PlayCardAction[] {
  const hand = state.hand;
  if (hand === null || hand.turn !== playerId) return [];
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player === undefined) return [];

  const actions: PlayCardAction[] = [];
  for (const card of player.hand) {
    const subsets = summingSubsets(hand.table, FIFTEEN - cardValue(card));
    if (subsets.length === 0) {
      actions.push({ type: "play-card", playerId, card, captured: [] });
      continue;
    }
    for (const captured of subsets) {
      actions.push({ type: "play-card", playerId, card, captured });
    }
  }
  return actions;
}
