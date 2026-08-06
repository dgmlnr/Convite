import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_CARDS } from "./deck.js";
import { cardLabel, getCardArt, getCardFrontUrl } from "./front-image.js";

describe("front-image: every card resolves to a real on-disk WebP asset", () => {
  it("resolves a URL ending in the card's own id for all 40 cards", () => {
    for (const card of ALL_CARDS) {
      const url = getCardFrontUrl(card);
      expect(url.pathname.endsWith(`/${card.rank}-${card.suit}.webp`)).toBe(true);
    }
  });

  it("points at a file that actually exists on disk for all 40 cards — none silently missing", () => {
    for (const card of ALL_CARDS) {
      const url = getCardFrontUrl(card);
      expect(existsSync(fileURLToPath(url))).toBe(true);
    }
  });

  it("gives every card a distinct URL (no two cards accidentally share art)", () => {
    const urls = new Set(ALL_CARDS.map((card) => getCardFrontUrl(card).href));
    expect(urls.size).toBe(40);
  });
});

describe("front-image: getCardArt composes a ready-to-render <img> descriptor", () => {
  it("returns a src pointing at the card's own file, a positive width/height, and a non-empty alt for all 40 cards", () => {
    for (const card of ALL_CARDS) {
      const art = getCardArt(card);
      expect(art.src).toContain(`${card.rank}-${card.suit}.webp`);
      expect(art.width).toBeGreaterThan(0);
      expect(art.height).toBeGreaterThan(0);
      expect(art.alt.length).toBeGreaterThan(0);
    }
  });

  it("gives every card's descriptor the same logical width/height (a hand must align, native pixel size varies per scan)", () => {
    const widths = new Set(ALL_CARDS.map((card) => getCardArt(card).width));
    const heights = new Set(ALL_CARDS.map((card) => getCardArt(card).height));
    expect(widths.size).toBe(1);
    expect(heights.size).toBe(1);
  });
});

describe("front-image: cardLabel — accessible label, domain suit terms kept per the language contract", () => {
  it("labels court cards with the Spanish domain term (sota/caballo/rey), not a number", () => {
    expect(cardLabel({ suit: "oro", rank: 10 })).toBe("Sota of oro");
    expect(cardLabel({ suit: "oro", rank: 11 })).toBe("Caballo of oro");
    expect(cardLabel({ suit: "oro", rank: 12 })).toBe("Rey of oro");
  });

  it("labels numeral cards with an English rank word plus the Spanish suit term", () => {
    expect(cardLabel({ suit: "espada", rank: 1 })).toBe("Ace of espada");
    expect(cardLabel({ suit: "copa", rank: 7 })).toBe("Seven of copa");
  });
});
