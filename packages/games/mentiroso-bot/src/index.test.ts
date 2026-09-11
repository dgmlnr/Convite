import { describe, expect, it } from "vitest";
import type { PlayerView } from "@hexdev/mentiroso-engine";
import { createBotStrategy } from "./index.js";
import { RIVAL_A, SELF, fixedRng } from "./fixtures.js";
import type { NonEmptyActions } from "./tier.js";

/**
 * `createBotStrategy` (SDD `mentiroso`, task 3.6) is the ONE place a
 * `BotTier` becomes a real `mentiroso-bot` strategy — `tier.ts`'s own
 * docblock (task 4.2) reserved this exact wrapper: "The narrowing itself
 * belongs to a future wrapper... once mentiroso-bot gets its own index.ts
 * barrel — not this unit's job." This file is that job. Mirrors
 * `generala-bot/src/index.ts`'s own shape: ONE shared empty-list guard, here
 * rather than duplicated three times the way `truco-bot` writes it.
 *
 * `easy.test.ts`/`normal.test.ts`/`hard.test.ts`/`round-robin.test.ts`
 * already prove each tier's OWN decisions; this file only proves the two
 * jobs that belong to the wrapper itself — routing a `BotTier` onto the
 * matching tier constructor, and the guard.
 */

const CEILING_VIEW: PlayerView = {
  self: { playerId: SELF, seat: 0, dice: [1, 1] },
  rivals: [{ seat: 1, playerId: RIVAL_A, diceCount: 2 }],
  phase: { kind: "bidding", turnSeat: 0, bid: { quantity: 4, face: 6 } },
};
const DOUBT_ONLY: NonEmptyActions = [{ type: "doubt", playerId: SELF }];

describe("createBotStrategy — routes a BotTier onto its own real tier constructor", () => {
  it("easy/normal/hard all answer at the ceiling, where only doubt is legal — routing, not divergence", () => {
    for (const tier of ["easy", "normal", "hard"] as const) {
      expect(createBotStrategy(tier, fixedRng(0.5)).chooseAction(CEILING_VIEW, DOUBT_ONLY, 50)).toEqual(DOUBT_ONLY[0]);
    }
  });
});

describe("createBotStrategy — ONE shared empty-list guard (design D7, tier.ts's own reserved wrapper)", () => {
  for (const tier of ["easy", "normal", "hard"] as const) {
    it(`${tier} throws rather than fabricating a move the table would refuse`, () => {
      expect(() => createBotStrategy(tier, fixedRng(0.5)).chooseAction(CEILING_VIEW, [], 50)).toThrow(/no legal actions/);
    });
  }

  it("all three refuse with the identical message, and it names no tier", () => {
    const messages = (["easy", "normal", "hard"] as const).map((tier) => {
      try {
        createBotStrategy(tier, fixedRng(0.5)).chooseAction(CEILING_VIEW, [], 50);
        return "did not throw";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).not.toBe("did not throw");
    for (const tier of ["easy", "normal", "hard"]) expect(messages[0]).not.toContain(tier);
  });
});
