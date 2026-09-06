import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DIE_FACES, type DieFace } from "./geometry.js";
import {
  CUP_ART_HEIGHT,
  CUP_ART_WIDTH,
  DIE_FACE_ART_HEIGHT,
  DIE_FACE_ART_WIDTH,
  getCupArtUrl,
  getDieFaceArt,
  getDieFaceArtUrl,
} from "./art.js";

interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Reads a WebP's canvas size out of its own header bytes — a near-copy of
 * `mahjong-tile-ui/front-image.test.ts`'s reader (itself copied from
 * `spanish-deck-ui`'s), and it has to be a copy rather than a shared import:
 * this package is L0 (`index.ts`'s own docblock) and cannot depend on
 * either. Deliberately NOT a hardcoded 297x297/228x269: a fence that
 * restates today's number cannot tell "the artwork is what we declare" from
 * "the artwork changed and so did the constant".
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

describe("art: every die face resolves to a real on-disk WebP asset", () => {
  it("resolves a URL ending in the face's own number for all six", () => {
    for (const face of DIE_FACES as readonly DieFace[]) {
      expect(getDieFaceArtUrl(face).pathname.endsWith(`/${String(face)}.webp`)).toBe(true);
    }
  });

  it("points at a file that actually exists on disk for all six — none silently missing", () => {
    for (const face of DIE_FACES as readonly DieFace[]) {
      expect(existsSync(fileURLToPath(getDieFaceArtUrl(face))), String(face)).toBe(true);
    }
  });

  it("gives every face a distinct URL (no two faces accidentally share art)", () => {
    const urls = new Set((DIE_FACES as readonly DieFace[]).map((face) => getDieFaceArtUrl(face).href));
    expect(urls.size).toBe(DIE_FACES.length);
  });
});

describe("art: getDieFaceArt composes a ready-to-render <img> descriptor", () => {
  it("returns a src pointing at the face's own file, a positive box, and a non-empty alt", () => {
    for (const face of DIE_FACES as readonly DieFace[]) {
      const art = getDieFaceArt(face);
      expect(art.src).toContain(`${String(face)}.webp`);
      expect(art.width).toBeGreaterThan(0);
      expect(art.height).toBeGreaterThan(0);
      expect(art.alt.length).toBeGreaterThan(0);
    }
  });

  it("gives every face the same box, so the cube's six facelets align without any consumer pinning a ratio", () => {
    expect(new Set((DIE_FACES as readonly DieFace[]).map((face) => getDieFaceArt(face).width)).size).toBe(1);
    expect(new Set((DIE_FACES as readonly DieFace[]).map((face) => getDieFaceArt(face).height)).size).toBe(1);
  });

  it("names each face by its own number, not a shared generic label", () => {
    const alts = new Set((DIE_FACES as readonly DieFace[]).map((face) => getDieFaceArt(face).alt));
    expect(alts.size).toBe(DIE_FACES.length);
  });
});

/**
 * THE DECLARED BOX AND THE PAINTED BOX MUST BE THE SAME BOX — the identical
 * argument `front-image.test.ts` makes: a browser reserves layout space from
 * the declared width/height before the bytes ever arrive.
 */
describe("art: the declared box matches the artwork actually on disk", () => {
  it("declares exactly the pixel dimensions of every one of the six real WebP files", () => {
    for (const face of DIE_FACES as readonly DieFace[]) {
      const art = getDieFaceArt(face);
      const onDisk = readWebpSize(fileURLToPath(getDieFaceArtUrl(face)));
      expect({ width: art.width, height: art.height }, `declared box for face ${String(face)}`).toEqual(onDisk);
    }
  });

  it("declares the cup's own box matching the real WebP file", () => {
    const onDisk = readWebpSize(fileURLToPath(getCupArtUrl()));
    expect({ width: CUP_ART_WIDTH, height: CUP_ART_HEIGHT }).toEqual(onDisk);
  });
});

describe("art: getCupArtUrl resolves to a real, distinct file", () => {
  it("points at a file that exists and is not any of the die faces", () => {
    expect(existsSync(fileURLToPath(getCupArtUrl()))).toBe(true);
    const dieUrls = new Set((DIE_FACES as readonly DieFace[]).map((face) => getDieFaceArtUrl(face).href));
    expect(dieUrls.has(getCupArtUrl().href)).toBe(false);
  });
});

describe("art: the die's declared size is square, matching the cube's own square facelets", () => {
  it("has equal width and height", () => {
    expect(DIE_FACE_ART_WIDTH).toBe(DIE_FACE_ART_HEIGHT);
  });
});
