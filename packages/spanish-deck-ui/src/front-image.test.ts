import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_CARDS } from "./deck.js";
import { CARD_FRONT_HEIGHT, CARD_FRONT_WIDTH, cardLabel, getCardArt, getCardFrontUrl } from "./front-image.js";
import type { Card } from "./card.js";

interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Reads a WebP's canvas size out of its own header bytes.
 *
 * Deliberately NOT a hardcoded 329x520: a fence that restates today's number
 * cannot tell "the artwork is what we declare" from "the artwork changed and
 * so did the constant", which is precisely the failure this suite exists to
 * catch. The dimensions have to come from the files themselves or the fence
 * is decorative.
 *
 * All three WebP variants are handled rather than only the VP8X the current
 * deck happens to encode as, because a future re-run of
 * `tools/process-svg-deck.mjs` with different encoder flags could legitimately
 * emit VP8/VP8L — and a reader that silently misparsed those would report a
 * wrong size instead of failing, which is worse than not checking at all.
 * An unrecognized container throws for the same reason.
 */
function readWebpSize(file: string): PixelSize {
  const bytes = readFileSync(file);
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error(`not a WebP file: ${file}`);
  }
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    // Extended format: 24-bit little-endian canvas width-1 / height-1.
    return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  }
  if (chunk === "VP8L") {
    // Lossless: 14 bits of width-1 then 14 bits of height-1, after the 0x2f signature.
    const packed = bytes.readUInt32LE(21);
    return { width: (packed & 0x3fff) + 1, height: ((packed >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8 ") {
    // Lossy: 14-bit width then height, after the 0x9d012a sync code.
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  throw new Error(`unrecognized WebP chunk "${chunk}" in ${file}`);
}

function assetSize(card: Card): PixelSize {
  return readWebpSize(fileURLToPath(getCardFrontUrl(card)));
}

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

  it("gives every card's descriptor the same width/height, so a hand aligns without any consumer pinning a ratio", () => {
    const widths = new Set(ALL_CARDS.map((card) => getCardArt(card).width));
    const heights = new Set(ALL_CARDS.map((card) => getCardArt(card).height));
    expect(widths.size).toBe(1);
    expect(heights.size).toBe(1);
  });
});

/**
 * The declared box and the painted box must be the same box.
 *
 * A browser reserves space from the `width`/`height` attributes before the
 * bytes arrive, then hands layout over to the decoded image's own ratio. While
 * `getCardArt` declared the card BACK's 220x336 over 329x520 artwork, those two
 * boxes disagreed by ~3.5%, and any consumer letting height follow the
 * intrinsic ratio reflowed on load.
 *
 * That mismatch survived three artwork replacements because the only thing
 * asserting the declared size was a comment, and comments do not fail. These
 * do, and they read the real files to do it.
 */
describe("front-image: the declared box matches the artwork actually on disk", () => {
  it("declares exactly the pixel dimensions of every one of the 40 real WebP files", () => {
    for (const card of ALL_CARDS) {
      const art = getCardArt(card);
      expect({ width: art.width, height: art.height }, `declared box for ${card.rank}-${card.suit}`).toEqual(assetSize(card));
    }
  });

  it("has uniform artwork, which is what makes ONE declared box derivable at all", () => {
    const sizes = new Set(ALL_CARDS.map((card) => `${assetSize(card).width}x${assetSize(card).height}`));
    expect(sizes.size, `distinct front sizes on disk: ${[...sizes].join(", ")}`).toBe(1);
  });

  it("keeps the exported constants tied to the assets, not to a number typed once", () => {
    const [reference] = ALL_CARDS;
    expect({ width: CARD_FRONT_WIDTH, height: CARD_FRONT_HEIGHT }).toEqual(assetSize(reference));
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
