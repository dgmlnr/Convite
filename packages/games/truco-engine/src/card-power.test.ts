import { describe, expect, it } from "vitest";
import { cardPower } from "./card-power.js";

describe("cardPower", () => {
  it("ranks 1-espada as the strongest card in the deck", () => {
    const oneEspada = cardPower({ suit: "espada", rank: 1 });
    const others = [
      cardPower({ suit: "basto", rank: 1 }),
      cardPower({ suit: "espada", rank: 7 }),
      cardPower({ suit: "oro", rank: 7 }),
      cardPower({ suit: "oro", rank: 1 }),
      cardPower({ suit: "copa", rank: 4 }),
    ];

    for (const power of others) {
      expect(oneEspada).toBeGreaterThan(power);
    }
  });

  it("orders the four matas: 1-espada > 1-basto > 7-espada > 7-oro", () => {
    expect(cardPower({ suit: "basto", rank: 1 })).toBeGreaterThan(cardPower({ suit: "espada", rank: 7 }));
    expect(cardPower({ suit: "espada", rank: 7 })).toBeGreaterThan(cardPower({ suit: "oro", rank: 7 }));
  });

  it("gives 1-oro and 1-copa (non-mata aces) equal power, below the matas", () => {
    expect(cardPower({ suit: "oro", rank: 1 })).toBe(cardPower({ suit: "copa", rank: 1 }));
    expect(cardPower({ suit: "oro", rank: 1 })).toBeLessThan(cardPower({ suit: "oro", rank: 7 }));
  });

  it("gives all four cards of the same non-privileged rank equal power", () => {
    const powers = (["espada", "basto", "oro", "copa"] as const).map((suit) => cardPower({ suit, rank: 12 }));

    expect(new Set(powers).size).toBe(1);
  });

  it("gives 7-basto and 7-copa equal power, below the 10s and above the 6s", () => {
    const sevenBasto = cardPower({ suit: "basto", rank: 7 });

    expect(sevenBasto).toBe(cardPower({ suit: "copa", rank: 7 }));
    expect(sevenBasto).toBeLessThan(cardPower({ suit: "espada", rank: 10 }));
    expect(sevenBasto).toBeGreaterThan(cardPower({ suit: "espada", rank: 6 }));
  });

  it("ranks 4s as the weakest cards in the deck", () => {
    expect(cardPower({ suit: "espada", rank: 4 })).toBeLessThan(cardPower({ suit: "espada", rank: 5 }));
  });
});
