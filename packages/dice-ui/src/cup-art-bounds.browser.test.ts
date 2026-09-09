import { describe, expect, it } from "vitest";
import { CUP_ART_HEIGHT, CUP_ART_WIDTH, getCupArtUrl } from "./art.js";
import { CUP_PIVOT_X_PERCENT, CUP_PIVOT_Y_PERCENT } from "./dice-styles.js";

/**
 * WHERE THE CUBILETE ACTUALLY IS INSIDE ITS OWN FILE, measured off the file.
 *
 * THE DEFECT THIS FENCES IS ALREADY IN THIS REPOSITORY'S RECORD, once, in a
 * different package: `game-ui-registry.ts` declares `cardArtIsCutOut` for
 * Generala alone, and its comment says why — "a die and a cubilete are
 * objects, not cards, and their files are mostly empty around them". That
 * emptiness cost a visual defect on the front door before anybody wrote it
 * down. `dice-styles.ts` now depends on the same fact for something a
 * reviewer cannot see at all: `CUP_PIVOT_X_PERCENT`/`-Y` name the point both
 * cup gestures rotate about, and they are the opaque pixels' own middle
 * rather than the box's, because the box's middle is empty sky.
 *
 * A CONSTANT DERIVED FROM AN IMAGE AND NEVER CHECKED AGAINST IT IS A
 * COMMENT. Re-render the cup a little smaller inside the same frame — a
 * plausible Blender tweak, `tools/render-props.py` is right there — and the
 * pivot silently becomes wrong: every shake and every tip would swing about
 * a point that is no longer the middle of anything, on every board, with
 * nothing failing. This is the assertion that goes red instead.
 *
 * IT HAS TO BE A BROWSER TEST. `art.test.ts` reads WebP HEADER bytes in Node
 * and can therefore only answer how big the canvas is; where the opaque
 * pixels sit inside it needs the file DECODED, and the decoder this project
 * already ships is the browser the rest of the suite runs in. The asset is
 * served same-origin by the harness's own dev server, so the canvas is not
 * tainted and `getImageData` is allowed.
 */

interface OpaqueBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly opaqueFraction: number;
}

/** Anything above this counts as drawn. A WebP's edge antialiasing leaves a
 * fringe of very low alpha that would otherwise stretch the bounds by a pixel
 * or two in every direction; the answer here is a middle, so a fringe is
 * noise rather than signal. */
const ALPHA_FLOOR = 8;

async function measureOpaqueBounds(url: string): Promise<OpaqueBounds> {
  const image = new Image();
  image.src = url;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2d context available to decode the cup");
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

  let minX = canvas.width;
  let maxX = -1;
  let minY = canvas.height;
  let maxY = -1;
  let opaque = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3]! <= ALPHA_FLOOR) continue;
      opaque++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error("the cup artwork decoded to nothing but transparency");
  return {
    left: minX / canvas.width,
    right: (maxX + 1) / canvas.width,
    top: minY / canvas.height,
    bottom: (maxY + 1) / canvas.height,
    opaqueFraction: opaque / (canvas.width * canvas.height),
  };
}

describe("cup art: the pivot both gestures turn about is the drawn cubilete's own middle", () => {
  it("still decodes to the canvas art.ts declares, so the fractions below mean what they say", async () => {
    const image = new Image();
    image.src = getCupArtUrl().href;
    await image.decode();
    expect(image.naturalWidth).toBe(CUP_ART_WIDTH);
    expect(image.naturalHeight).toBe(CUP_ART_HEIGHT);
  });

  /**
   * The anti-vacuity control for everything below. If the artwork ever
   * became a full-bleed rectangle, the box's middle and the object's middle
   * would coincide, every assertion under this would pass for a reason that
   * had stopped being true, and `cardArtIsCutOut` next door would be a lie.
   */
  it("is still mostly empty — a cut-out object, not a full-bleed card", async () => {
    const bounds = await measureOpaqueBounds(getCupArtUrl().href);
    expect(bounds.opaqueFraction).toBeLessThan(0.5);
  });

  it("still sits in the lower two thirds of its own frame, leaving the top third empty", async () => {
    const bounds = await measureOpaqueBounds(getCupArtUrl().href);
    expect(bounds.top, "the cup's rim should start about a third of the way down").toBeGreaterThan(0.25);
    expect(bounds.bottom, "and its base should reach very nearly the bottom edge").toBeGreaterThan(0.95);
  });

  /**
   * THE ASSERTION THE PIVOT ACTUALLY RESTS ON. Two percentage points of
   * tolerance on a 124x146 box is under 3px in either direction — below what
   * a rotation of this size makes visible, and tight enough that a
   * re-rendered cup which moved inside its frame at all would be caught.
   */
  it.each([
    ["horizontally", CUP_PIVOT_X_PERCENT, (b: OpaqueBounds) => (b.left + b.right) / 2],
    ["vertically", CUP_PIVOT_Y_PERCENT, (b: OpaqueBounds) => (b.top + b.bottom) / 2],
  ] as const)("puts the declared pivot %s within two points of where the cubilete really is", async (_axis, declaredPercent, middleOf) => {
    const bounds = await measureOpaqueBounds(getCupArtUrl().href);
    // A plain range rather than `toBeCloseTo`, whose second argument counts
    // DECIMAL DIGITS and not tolerance — written the other way first, it
    // demanded agreement to within a sixth of a point and failed on a cup
    // that is 0.24 points off centre, which is a quarter of a pixel here.
    expect(middleOf(bounds) * 100).toBeGreaterThan(declaredPercent - 2);
    expect(middleOf(bounds) * 100).toBeLessThan(declaredPercent + 2);
  });

  /**
   * Named separately because it is the half a reader is most likely to
   * assume away: the pivot is BELOW the box's centre, and that is not a
   * rounding artefact. Hard-coding a plain `50% 50%` would look reasonable in
   * review and would turn every gesture about a point three centimetres above
   * the cup on a phone.
   */
  it("is emphatically not the box's own centre on the vertical axis", async () => {
    const bounds = await measureOpaqueBounds(getCupArtUrl().href);
    expect((bounds.top + bounds.bottom) / 2).toBeGreaterThan(0.6);
    expect(CUP_PIVOT_Y_PERCENT).toBeGreaterThan(55);
  });
});
