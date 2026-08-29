// Structurally identical to truco-engine's `Card` and to spanish-deck-ui's
// `Card` (same suit names, same rank set, same id format) by deliberate
// choice, NOT by importing either: escoba-engine is L0, exactly like
// truco-engine, and must not depend on any other workspace package
// (dependency-cruiser's L0 rule for game engines). This shape already
// satisfies spanish-deck-ui's `getCardArt`/`getCardFrontUrl` structurally, so
// no adapter is ever needed to render an escoba card with the shared deck art.

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
