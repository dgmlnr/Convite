import { describe, expect, it } from "vitest";
import { SUITS } from "./card.js";
import { courtFigureMarkup } from "./court-figures.js";

const COURT_RANKS = [10, 11, 12] as const;

describe("court-figures", () => {
  it("produces non-empty markup for all 12 court cards (3 ranks x 4 suits)", () => {
    for (const suit of SUITS) {
      for (const rank of COURT_RANKS) {
        expect(courtFigureMarkup(suit, rank).length).toBeGreaterThan(0);
      }
    }
  });

  it("gives each rank (sota/caballo/rey) a distinct silhouette, independent of suit", () => {
    const bySuit = SUITS[0]!;
    const sota = courtFigureMarkup(bySuit, 10);
    const caballo = courtFigureMarkup(bySuit, 11);
    const rey = courtFigureMarkup(bySuit, 12);
    expect(new Set([sota, caballo, rey]).size).toBe(3);
  });

  it("colors each figure's suit accent via that suit's CSS custom property, never a hardcoded color", () => {
    for (const suit of SUITS) {
      for (const rank of COURT_RANKS) {
        const markup = courtFigureMarkup(suit, rank);
        expect(markup).toContain(`var(--deck-suit-${suit})`);
        expect(markup).not.toMatch(/(?:fill|stroke)="#[0-9a-fA-F]/);
        expect(markup).not.toMatch(/(?:fill|stroke)="rgb/);
      }
    }
  });

  it("varies markup by suit for the same rank (suit accent actually changes the output)", () => {
    const rey = courtFigureMarkup(SUITS[0]!, 12);
    const reyOtherSuit = courtFigureMarkup(SUITS[1]!, 12);
    expect(rey).not.toBe(reyOtherSuit);
  });
});
