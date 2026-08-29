import type { Card, Rank } from "./card.js";

// Capture values (art. 7.1 of the Reglamento Oficial, Juegos Bonaerenses
// 2026): "Las demás cartas valdrán segun su numero" (1-7 face value); sota=8,
// caballo=9, rey=10. See `escoba/reglas-verificadas`.
//
// DISTINCT from la setenta's own weighted-sum table (SETENTA_VALUE, Unit H,
// arts. 11-12): the same rank carries two different point counts depending
// on which of the game's two scoring rules is asking. Do not reuse this
// table for la setenta, and do not reuse la setenta's table here — mutation
// row 11 in the design exists precisely to catch that confusion.
const CARD_VALUE: Readonly<Record<Rank, number>> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  10: 8, // sota
  11: 9, // caballo
  12: 10, // rey
};

export function cardValue(card: Card): number {
  return CARD_VALUE[card.rank];
}
