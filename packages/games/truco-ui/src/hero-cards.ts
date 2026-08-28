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

/**
 * What this game calls itself on the front door.
 *
 * NOT the catalog's display name, and the difference matters: the catalog has
 * "Truco Argentino" and "Truco Argentino 2v2" as separate entries, because
 * they are separate matches to join. On the door they are one game with two
 * formats, and printing an entry name there would put a seat count in the
 * title of the screen.
 *
 * Declared by the game for the same reason its cards and its credits are: the
 * shell is game-agnostic and must not learn that this platform is currently
 * mostly truco.
 */
export const HERO_TITLE = "Truco Argentino";

export const HERO_CARDS: readonly string[] = FACES.map((card) => getCardFrontUrl(card).href);

/**
 * The three cards that name this game on a CARD, as opposed to on a door.
 *
 * NOT `HERO_CARDS.slice(0, 3)`, and the reason is one line above this file's
 * own rule: ORDER IS THE LAYOUT, and the fan's middle entry is the one
 * nothing overlaps. Slicing the first three would put the as de espada — the
 * best card in the game, and the reason that array is ordered the way it is —
 * at the right EDGE, half hidden, while a three of cups took the centre.
 *
 * WHICH THREE: the two aces that decide most hands, plus the seven of swords
 * between them. All three are matas; a player reads them before they read the
 * name. The as de espada holds the middle for the same reason it holds the
 * middle of the door.
 *
 * Three and not five because this sits inside a card in a list, where five
 * fanned faces stop being a hand and become a texture. The odd count still
 * buys a real centre, which is the half of the five-card reasoning that
 * survives the size change.
 */
const CARD_FACES: readonly Card[] = [
  { suit: "basto", rank: 1 },
  { suit: "espada", rank: 1 },
  { suit: "espada", rank: 7 },
];

export const CARD_ART: readonly string[] = CARD_FACES.map((card) => getCardFrontUrl(card).href);
