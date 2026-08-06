import { RANKS, SUITS, type Card } from "./card.js";

// `getCardArt` used to live here too, memoized, because composing an SVG
// front was real work worth caching. Front art is now a URL lookup
// (front-image.ts) — cheap enough that memoization would add complexity for
// no measurable benefit, so it was dropped rather than carried over unused.
export const ALL_CARDS: readonly Card[] = SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
