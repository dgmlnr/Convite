import { RANKS, SUITS, cardId, type Card } from "./card.js";
import { composeCardSvg } from "./card-svg.js";

export const ALL_CARDS: readonly Card[] = SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));

const artCache = new Map<string, string>();

/** Front-face SVG markup for a card, memoized by card id. */
export function getCardArt(card: Card): string {
  const id = cardId(card);
  const cached = artCache.get(id);
  if (cached !== undefined) {
    return cached;
  }
  const art = composeCardSvg(card);
  artCache.set(id, art);
  return art;
}
