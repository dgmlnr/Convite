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

/**
 * WCAG 3.1.2 (B8): this label ships as an `<img alt>` inside a `lang="es"`
 * document, so a Spanish screen reader pronounces every word of it with
 * Spanish phonemes. "Ace of oro" came out as neither language; the card has a
 * real Spanish name and this is it.
 *
 * The vocabulary is not invented here — `truco-ui`'s own `SENA_LABELS` already
 * says "As de espada" and "7 de oro" to the same players, so these two must
 * agree word for word or the product names one card two ways.
 */
describe("front-image: cardLabel — the card's real Spanish name (WCAG 3.1.2)", () => {
  it("labels court cards with the Spanish domain term (sota/caballo/rey), not a number", () => {
    expect(cardLabel({ suit: "oro", rank: 10 })).toBe("Sota de oro");
    expect(cardLabel({ suit: "basto", rank: 11 })).toBe("Caballo de basto");
    expect(cardLabel({ suit: "copa", rank: 12 })).toBe("Rey de copa");
  });

  it("names the ace 'As', never a digit and never the English word", () => {
    expect(cardLabel({ suit: "espada", rank: 1 })).toBe("As de espada");
  });

  it("leaves plain numerals as digits, the way SENA_LABELS already writes '7 de oro'", () => {
    expect(cardLabel({ suit: "espada", rank: 4 })).toBe("4 de espada");
    expect(cardLabel({ suit: "copa", rank: 7 })).toBe("7 de copa");
  });

  it("carries no English connective on ANY of the 40 cards — the mixed-language shape is gone as a class, not per case", () => {
    for (const card of ALL_CARDS) {
      expect(cardLabel(card), `label for ${card.rank}-${card.suit}`).toMatch(/^(As|[2-7]|Sota|Caballo|Rey) de (oro|copa|espada|basto)$/u);
    }
  });
});
