// Structurally identical to truco-engine's `Card` (same suit names, same rank
// set, same id format) by deliberate choice, NOT by importing it: this package
// is L0 and must not depend on any game package (dependency-cruiser rule
// l0-spanish-deck-ui-no-workspace-deps). Any Spanish-deck game's own `Card`
// (truco-engine's today, escoba's tomorrow) already satisfies this shape
// structurally, so no adapter is ever needed to call `getCardArt`.

export type Suit = "espada" | "basto" | "oro" | "copa";

export const SUITS: readonly Suit[] = ["espada", "basto", "oro", "copa"];

export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;

export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

export interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
}

export function cardId(card: Card): string {
  return `${card.rank}-${card.suit}`;
}
