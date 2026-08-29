import { RANKS, SUITS, type Card } from "./card.js";

// Structurally identical to truco-engine's `buildDeck` — same iteration
// order (suit outer, rank inner) — by deliberate mirroring, not import
// (card.ts's own header comment explains why escoba-engine never imports
// truco-engine: L0 purity).
export function buildDeck(): readonly Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}
