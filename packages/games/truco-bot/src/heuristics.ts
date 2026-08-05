import { calculateEnvidoPoints, cardPower } from "@hexdev/truco-engine";
import type { Card } from "@hexdev/truco-engine";

/**
 * Sum of the real engine's card power across a hand — the bot's own proxy
 * for "how strong are these cards for winning tricks". Delegates to the
 * engine's `cardPower` (design: never reimplement rules the engine already
 * owns), never guesses at hidden state.
 */
export function handPower(hand: readonly Card[]): number {
  return hand.reduce((sum, card) => sum + cardPower(card), 0);
}

/** Thin re-export of the engine's own envido calculation — same reasoning
 * as `handPower`: the bot never reimplements a rule the engine already has. */
export function envidoPoints(hand: readonly Card[]): number {
  return calculateEnvidoPoints(hand);
}

/**
 * Scores playing `myCard` against an ALREADY-VISIBLE `opponentCard` (public
 * information — the opponent's card is exposed in `HandView.currentTrickPlays`
 * once played, unlike unplayed hand cards). No hidden-state guessing needed
 * here, so this is shared identically by every tier that faces this exact
 * situation: prefer the cheapest card that still wins, and if no card wins,
 * sacrifice the cheapest one rather than the strongest.
 */
export function scoreFollowingCardPlay(myCard: Card, opponentCard: Card): number {
  const diff = cardPower(myCard) - cardPower(opponentCard);
  if (diff > 0) return 1000 - cardPower(myCard);
  if (diff === 0) return 500 - cardPower(myCard);
  return -cardPower(myCard);
}
