import { cardId, type Card } from "./card.js";

/**
 * Truco Argentino card hierarchy, strongest group first. Cards within the
 * same group have equal power and produce a parda when they meet in a trick.
 */
const POWER_ORDER: readonly (readonly string[])[] = [
  ["1-espada"],
  ["1-basto"],
  ["7-espada"],
  ["7-oro"],
  ["3-espada", "3-basto", "3-oro", "3-copa"],
  ["2-espada", "2-basto", "2-oro", "2-copa"],
  ["1-oro", "1-copa"],
  ["12-espada", "12-basto", "12-oro", "12-copa"],
  ["11-espada", "11-basto", "11-oro", "11-copa"],
  ["10-espada", "10-basto", "10-oro", "10-copa"],
  ["7-basto", "7-copa"],
  ["6-espada", "6-basto", "6-oro", "6-copa"],
  ["5-espada", "5-basto", "5-oro", "5-copa"],
  ["4-espada", "4-basto", "4-oro", "4-copa"],
];

const POWER_BY_CARD_ID: ReadonlyMap<string, number> = new Map(
  POWER_ORDER.flatMap((group, groupIndex) =>
    group.map((id) => [id, POWER_ORDER.length - groupIndex] as const),
  ),
);

/** Higher power wins a trick; equal power is a parda (tie). */
export function cardPower(card: Card): number {
  const power = POWER_BY_CARD_ID.get(cardId(card));
  if (power === undefined) {
    throw new Error(`unknown card: ${cardId(card)}`);
  }
  return power;
}
