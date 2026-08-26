import { getCardFrontUrl } from "@hexdev/spanish-deck-ui";
import type { Card } from "@hexdev/spanish-deck-ui";

/**
 * The cards this game puts on the front door, left to right.
 *
 * NOT AN ARBITRARY FIVE, in two ways.
 *
 * WHICH: the four matas — as de espada, as de basto, siete de espada, siete
 * de oro — are the cards that decide hands, plus a three, which is what a
 * player counts when they are adding up an envido. Somebody who plays truco
 * reads this row before they read the heading; somebody who does not still
 * sees a hand of cards. That is the whole job.
 *
 * AND HOW MANY: five, because an odd count fans around a real centre. With
 * four, the middle two sit either side of nothing and the hand reads as two
 * pairs — which is exactly how the first version of this looked.
 *
 * ORDER IS THE LAYOUT. The shell fans this array left to right and the middle
 * entry is the one fully visible, so the as de espada goes in the middle: the
 * best card in the game, face up, in the one position nothing overlaps.
 *
 * URLs, not markup: the shell decides how to lay them out, and it must be
 * able to without importing a card renderer.
 */
const FACES: readonly Card[] = [
  { suit: "copa", rank: 3 },
  { suit: "oro", rank: 7 },
  { suit: "espada", rank: 1 },
  { suit: "basto", rank: 1 },
  { suit: "espada", rank: 7 },
];

export const HERO_CARDS: readonly string[] = FACES.map((card) => getCardFrontUrl(card).href);
