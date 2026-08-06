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
