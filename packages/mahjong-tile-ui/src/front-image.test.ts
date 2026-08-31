import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TILE_ART_RATIO, TILE_MAX_INLINE_SIZE, TILE_RASTER_OVERSAMPLE } from "./geometry.js";
import { TILE_FRONT_HEIGHT, TILE_FRONT_WIDTH, getTileArt, getTileFrontUrl, tileLabel } from "./front-image.js";
import { ALL_TILE_FACES } from "./tiles.js";
import { tileId, type Tile } from "./tile.js";

interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Reads a WebP's canvas size out of its own header bytes. Deliberately NOT a
 * hardcoded 195x279: a fence that restates today's number cannot tell "the
 * artwork is what we declare" from "the artwork changed and so did the
 * constant", which is precisely what this suite exists to catch.
 *
 * A near-copy of `spanish-deck-ui/src/front-image.test.ts`'s reader, and it
 * has to be: this package is L0 and structurally cannot import the deck's.
 * All three WebP variants are handled rather than only the VP8L this artwork
 * happens to encode as, because a re-run of the build tool with different
 * flags could legitimately emit VP8/VP8X — and a reader that silently
 * misparsed those would report a wrong size instead of failing.
 */
function readWebpSize(file: string): PixelSize {
  const bytes = readFileSync(file);
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error(`not a WebP file: ${file}`);
  }
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  }
  if (chunk === "VP8L") {
    const packed = bytes.readUInt32LE(21);
    return { width: (packed & 0x3fff) + 1, height: ((packed >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8 ") {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  throw new Error(`unrecognized WebP chunk "${chunk}" in ${file}`);
}

function assetSize(tile: Tile): PixelSize {
  return readWebpSize(fileURLToPath(getTileFrontUrl(tile)));
}

describe("front-image: every face resolves to a real on-disk WebP asset", () => {
  it("resolves a URL ending in the face's own id for all 42", () => {
    for (const tile of ALL_TILE_FACES) {
      expect(getTileFrontUrl(tile).pathname.endsWith(`/${tileId(tile)}.webp`)).toBe(true);
    }
  });

  it("points at a file that actually exists on disk for all 42 — none silently missing", () => {
    for (const tile of ALL_TILE_FACES) {
      expect(existsSync(fileURLToPath(getTileFrontUrl(tile))), tileId(tile)).toBe(true);
    }
  });

  it("gives every face a distinct URL (no two faces accidentally share art)", () => {
    const urls = new Set(ALL_TILE_FACES.map((tile) => getTileFrontUrl(tile).href));
    expect(urls.size).toBe(ALL_TILE_FACES.length);
  });
});

describe("front-image: getTileArt composes a ready-to-render <img> descriptor", () => {
  it("returns a src pointing at the face's own file, a positive box, and a non-empty alt", () => {
    for (const tile of ALL_TILE_FACES) {
      const art = getTileArt(tile);
      expect(art.src).toContain(`${tileId(tile)}.webp`);
      expect(art.width).toBeGreaterThan(0);
      expect(art.height).toBeGreaterThan(0);
      expect(art.alt.length).toBeGreaterThan(0);
    }
  });

  it("gives every face the same box, so a board aligns without any consumer pinning a ratio", () => {
    expect(new Set(ALL_TILE_FACES.map((tile) => getTileArt(tile).width)).size).toBe(1);
    expect(new Set(ALL_TILE_FACES.map((tile) => getTileArt(tile).height)).size).toBe(1);
  });
});

/**
 * THE DECLARED BOX AND THE PAINTED BOX MUST BE THE SAME BOX.
 *
 * A browser reserves space from the `width`/`height` attributes before the
 * bytes arrive, then hands layout to the decoded image's own ratio. The deck
 * shipped a mismatch through three artwork replacements because the only
 * thing asserting the declared size was a comment, and comments do not fail.
 * These do, and they read the real files to do it.
 */
describe("front-image: the declared box matches the artwork actually on disk", () => {
  it("declares exactly the pixel dimensions of every one of the 42 real WebP files", () => {
    for (const tile of ALL_TILE_FACES) {
      const art = getTileArt(tile);
      expect({ width: art.width, height: art.height }, `declared box for ${tileId(tile)}`).toEqual(assetSize(tile));
    }
  });

  it("has uniform artwork, which is what makes ONE declared box derivable at all", () => {
    const sizes = new Set(ALL_TILE_FACES.map((tile) => `${String(assetSize(tile).width)}x${String(assetSize(tile).height)}`));
    expect(sizes.size, `distinct face sizes on disk: ${[...sizes].join(", ")}`).toBe(1);
  });
});

/**
 * AND THE DECLARED BOX MUST STILL FOLLOW FROM THE RULE THAT PRODUCED IT.
 *
 * The fence above ties the constant to the bytes; this one ties it to the
 * REASON. Without it, moving `TILE_MAX_INLINE_SIZE` and re-rasterizing to
 * match would leave both green while the cap and the raster silently stopped
 * describing each other — the deck's stale-rationale failure again, one level
 * up: there the comment outlived the artwork, here the number would outlive
 * the argument.
 *
 * The rule is the deck's own (`process-svg-deck.mjs:25-29`): rasterize at
 * ~2.7x the largest width the artwork is ever drawn at. Because this artwork
 * IS the tile rather than something inset inside one, that largest width is
 * the tile cap itself.
 */
describe("front-image: the raster follows from the cap, not from a number typed once", () => {
  it("is the cap oversampled by the deck's own factor", () => {
    expect(TILE_FRONT_WIDTH).toBe(Math.ceil(TILE_MAX_INLINE_SIZE * TILE_RASTER_OVERSAMPLE));
  });

  it("keeps the artwork's intrinsic ratio rather than a shape of its own", () => {
    expect(TILE_FRONT_HEIGHT).toBe(Math.round(TILE_FRONT_WIDTH / TILE_ART_RATIO));
  });
});

/**
 * WCAG 3.1.2. This label ships as an `<img alt>` inside a `lang="es"`
 * document, so a Spanish screen reader pronounces every word of it with
 * Spanish phonemes — the same argument, and the same failure, that
 * `spanish-deck-ui`'s `cardLabel` records after "Ace of oro" came out as
 * neither language.
 */
describe("front-image: tileLabel — the tile's name in one language (WCAG 3.1.2)", () => {
  it("names a suit tile by its number and its suit", () => {
    expect(tileLabel({ kind: "suit", suit: "circles", rank: 5 })).toBe("5 de círculos");
    expect(tileLabel({ kind: "suit", suit: "bamboo", rank: 3 })).toBe("3 de bambúes");
    expect(tileLabel({ kind: "suit", suit: "characters", rank: 9 })).toBe("9 de caracteres");
  });

  it("names the honours the way a table names them", () => {
    expect(tileLabel({ kind: "wind", wind: "east" })).toBe("viento este");
    expect(tileLabel({ kind: "dragon", dragon: "red" })).toBe("dragón rojo");
  });

  /**
   * The collision the ids already guard against, said out loud a second time
   * because a screen reader hears the label and never the id: 條 is a suit of
   * sticks and 竹 is the bamboo FLOWER, and "3 de bambúes" must not sound like
   * "flor de bambú".
   */
  it("keeps the bamboo suit and the bamboo flower apart out loud too", () => {
    expect(tileLabel({ kind: "flower", flower: "bamboo" })).toBe("flor de bambú");
    expect(tileLabel({ kind: "suit", suit: "bamboo", rank: 3 })).not.toBe(tileLabel({ kind: "flower", flower: "bamboo" }));
  });

  it("names the seasons as seasons, so eight bonus tiles are not four ambiguous ones", () => {
    expect(tileLabel({ kind: "season", season: "spring" })).toBe("estación de primavera");
    expect(tileLabel({ kind: "flower", flower: "plum" })).toBe("flor de ciruelo");
  });

  it("gives all 42 a distinct label — no two faces read the same aloud", () => {
    const labels = new Set(ALL_TILE_FACES.map((tile) => tileLabel(tile)));
    expect(labels.size).toBe(ALL_TILE_FACES.length);
  });

  it("carries no English on ANY of the 42 — the mixed-language shape is gone as a class, not per case", () => {
    for (const tile of ALL_TILE_FACES) {
      expect(tileLabel(tile), `label for ${tileId(tile)}`).toMatch(
        /^([1-9] de (círculos|bambúes|caracteres)|viento (este|sur|oeste|norte)|dragón (rojo|verde|blanco)|flor de (ciruelo|orquídea|crisantemo|bambú)|estación de (primavera|verano|otoño|invierno))$/u,
      );
    }
  });
});
