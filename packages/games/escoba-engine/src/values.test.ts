import { describe, expect, it } from "vitest";
import { SUITS } from "./card.js";
import { cardValue } from "./values.js";

// Reglamento Oficial, Juegos Bonaerenses 2026, art. 7.1: "Las demás cartas
// valdrán segun su numero" (1 to 7); sota=8, caballo=9, rey=10. See
// `escoba/reglas-verificadas`. DISTINCT from la setenta's weighted-sum
// table (Unit H) — the same rank means two different point counts
// depending on which of the game's two scoring rules is asking.
describe("cardValue", () => {
  it("values numeral cards at their own face value, 1 through 7 (art. 7.1)", () => {
    for (const rank of [1, 2, 3, 4, 5, 6, 7] as const) {
      expect(cardValue({ suit: "oro", rank })).toBe(rank);
    }
  });

  it("values sota at 8, caballo at 9, and rey at 10 (art. 7.1)", () => {
    expect(cardValue({ suit: "oro", rank: 10 })).toBe(8);
    expect(cardValue({ suit: "oro", rank: 11 })).toBe(9);
    expect(cardValue({ suit: "oro", rank: 12 })).toBe(10);
  });

  it("does not depend on suit", () => {
    for (const suit of SUITS) {
      expect(cardValue({ suit, rank: 7 })).toBe(7);
      expect(cardValue({ suit, rank: 12 })).toBe(10);
    }
  });
});
