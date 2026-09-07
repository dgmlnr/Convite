import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import type { DieFace } from "./geometry.js";
import { DIE_CUBE_SIZE, DIE_SCENE_SIZE, ensureDiceStyles } from "./dice-styles.js";
import { createDiceCup } from "./dice.js";
import { createDieSceneElement } from "./die.js";

/**
 * THE TRAY AT EVERY WIDTH SOMEBODY ACTUALLY HOLDS — measured, never
 * eyeballed. `dice.scene.test.ts` renders the same tray for a human to look
 * at and cannot tell anyone whether a die fits; that is this file's job, and
 * the split is the same one `visual-review.mjs`'s own header draws between a
 * screenshot and a `getBoundingClientRect()` assertion.
 *
 * WHY A SEPARATELY SIZED BOX EXISTS AT ALL, and the one correction this
 * whole file is built around: `transform: scale()` is PAINT-TIME. It changes
 * what a browser draws and not what it lays out, so a scaled
 * `.hexdev-dice-scene` still occupies its full `DIE_SCENE_SIZE` in the flex
 * row and the tray does not reflow by one pixel. Scaling alone is a no-op
 * for fitting. `.hexdev-dice-scene-box` is the layout half — a real, sized
 * box the flex row can measure — and `.hexdev-dice-scene`'s `transform` is
 * the paint half that shrinks the drawing to match it. The two assertions
 * below that read `offsetWidth` (layout) and `getBoundingClientRect()`
 * (paint) off the SAME element are what separate a correct implementation
 * from either half on its own.
 *
 * WHY THE CUBE'S OWN BOX IS NEVER ALLOWED TO MOVE. Every facelet is pushed
 * out of the cube's centre by `DIE_SIDE_LOCAL_TRANSFORM`'s fixed
 * `translateZ`, a constant number of CSS pixels calibrated once against
 * `DIE_SIZE` (`geometry.ts`) and deliberately decoupled from whatever box
 * contains it (`dice-styles.ts`'s own `.hexdev-dice-cube` comment). A
 * responsive tray implemented by RESIZING widths — the obvious-looking fix —
 * shrinks the facelets while that push stays 50px, so the six faces stop
 * meeting at their shared edges and the die comes apart at the seams. The
 * seam fence below is the one assertion that tells the two implementations
 * apart, because a width-based one measures identically on every other axis.
 */

const ROLL: readonly DieFace[] = [3, 5, 5, 2, 6];

/**
 * THE LADDER, PINNED. The widths are `dice.browser.test.ts`'s own
 * `BREAKPOINTS` — the set this repository already standardizes on for a
 * geometry fence — and the scales are the values `dice-styles.ts`'s `@media`
 * blocks ship.
 *
 * The SCALE is hand-written here on purpose and the expected box size is
 * computed from it. Reading the ladder back out of the stylesheet would make
 * this file agree with any ladder at all, which is the opposite of a pin;
 * `DIE_SCENE_SIZE`, by contrast, is slice-7 geometry that `dice-styles.test.ts`
 * already fences on its own, so multiplying by it here re-reads a fenced
 * number rather than copying an unfenced one.
 */
const LADDER: readonly { readonly width: number; readonly scale: number }[] = [
  { width: 320, scale: 0.45 },
  { width: 375, scale: 0.45 },
  { width: 700, scale: 0.6 },
  { width: 960, scale: 1 },
  { width: 1280, scale: 1 },
  { width: 1550, scale: 1 },
];

/** Sub-pixel slack, the same order of magnitude `truco-ui`'s own layout
 * fences allow: these are real laid-out boxes, not integers. */
const EPSILON = 0.5;

const mounted: HTMLElement[] = [];
afterEach(async () => {
  while (mounted.length > 0) mounted.pop()!.remove();
  await page.viewport(414, 896);
});

function mountRolledCup() {
  const handle = createDiceCup(document, { onPress: () => {} });
  document.body.appendChild(handle.element);
  mounted.push(handle.element);
  handle.roll(ROLL);
  return handle;
}

describe("dice tray: the die's layout box shrinks with the viewport, at the pinned ladder and nowhere else", () => {
  it.each(LADDER)("at $width px the scene box measures DIE_SCENE_SIZE x $scale, on every one of the five dice", async ({ width, scale }) => {
    await page.viewport(width, 900);
    const handle = mountRolledCup();

    const boxes = [...handle.trayElement.querySelectorAll<HTMLElement>(".hexdev-dice-scene-box")];
    expect(boxes.length, "expected one sized layout box per die").toBe(ROLL.length);

    for (const box of boxes) {
      const rect = box.getBoundingClientRect();
      expect(rect.width).toBeCloseTo(DIE_SCENE_SIZE * scale, 1);
      expect(rect.height).toBeCloseTo(DIE_SCENE_SIZE * scale, 1);
    }
  });
});

describe("dice tray: five dice fit inside the tray, and the tray inside the viewport, at every standardized width", () => {
  it.each(LADDER)("at $width px no die is clipped by the tray and nothing overflows the page horizontally", async ({ width }) => {
    await page.viewport(width, 900);
    const handle = mountRolledCup();

    const tray = handle.trayElement.getBoundingClientRect();
    for (const box of handle.trayElement.querySelectorAll<HTMLElement>(".hexdev-dice-scene-box")) {
      const rect = box.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(tray.left - EPSILON);
      expect(rect.right).toBeLessThanOrEqual(tray.right + EPSILON);
    }

    // The tray wraps (`.hexdev-dice-tray` is `flex-wrap: wrap`), so "fits"
    // is never a claim about ONE row — it is the claim that nothing ends up
    // outside the page. A tray that clipped instead of wrapping would push
    // the document's own scroll width past the viewport, which is the
    // measurable difference between the two.
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  });
});

describe("dice tray: the scale is applied at paint time, never by resizing the box the die's geometry is calibrated against", () => {
  /**
   * THE SEAM FENCE. `DIE_SIDE_LOCAL_TRANSFORM` pushes every facelet out by a
   * FIXED `translateZ`; the cube's own layout box is the thing that push is
   * calibrated against, so it must read the same number of CSS pixels at
   * 320px as at 1550px. An implementation that shrank the tray by writing
   * `width: calc(… * var(--dice-scene-scale))` onto the cube — or onto
   * `.hexdev-dice-face`, which is `inset: 0` inside it — would satisfy every
   * other assertion in this file and fail exactly here.
   */
  it.each(LADDER)("at $width px the cube's own layout box, and every facelet inside it, measures exactly what translateZ was calibrated against", async ({ width }) => {
    await page.viewport(width, 900);
    const handle = mountRolledCup();

    const cubes = [...handle.trayElement.querySelectorAll<HTMLElement>(".hexdev-dice-cube")];
    expect(cubes.length).toBe(ROLL.length);

    for (const cube of cubes) {
      // `offsetWidth` is LAYOUT and is blind to an ancestor's transform, so
      // it reads the same number at 320px as at 1550px under a correct
      // implementation and follows the viewport under a width-based one.
      expect(cube.offsetWidth, "the cube's own box must never scale — translateZ is a fixed push").toBe(DIE_CUBE_SIZE);
      expect(cube.offsetHeight).toBe(DIE_CUBE_SIZE);

      const facelet = cube.querySelector<HTMLElement>(".hexdev-dice-face");
      expect(facelet, "expected a facelet inside the cube").not.toBeNull();
      expect(facelet!.offsetWidth, "a facelet is inset: 0 in the cube and inherits its fixed box").toBe(DIE_CUBE_SIZE);
    }
  });

  /**
   * THE OTHER HALF OF THE SAME CLAIM: the box may not move, and the PAINT
   * must. One sweep rather than six independent cases, because the honest
   * unscaled reference is a measurement and not a literal.
   *
   * MEASURED, and it corrected this test's first draft. A resting cube's
   * painted width is NOT `DIE_CUBE_SIZE`: it sits inside
   * `.hexdev-dice-scene`'s `perspective: 480px` under a real 3D rotation, so
   * `getBoundingClientRect()` returns its PROJECTED box — 124.2px for a
   * 110px cube at scale 1, the same perspective enlargement that rule's own
   * `overflow: hidden` exists to crop. Asserting `DIE_CUBE_SIZE * scale`
   * against it failed at all six widths for a reason that had nothing to do
   * with the responsive ladder. What is true, and is what this measures, is
   * that a uniform `scale()` multiplies whatever that projection happens to
   * be: every width's painted cube is the widest width's painted cube times
   * its own scale, exactly.
   */
  it("shrinks what a die PAINTS by exactly the ladder's own scale, measured against the unscaled tier rather than a literal", async () => {
    const painted = new Map<number, number>();

    for (const { width } of LADDER) {
      await page.viewport(width, 900);
      const handle = mountRolledCup();
      const cube = handle.trayElement.querySelector<HTMLElement>(".hexdev-dice-cube");
      expect(cube, "expected a cube in the tray").not.toBeNull();
      painted.set(width, cube!.getBoundingClientRect().width);
      // Torn down inside the loop: `afterEach` only runs once, at the end of
      // this whole sweep, and a second cup left mounted would change the
      // page's own layout under the next viewport.
      handle.element.remove();
    }

    const widest = LADDER[LADDER.length - 1]!;
    expect(widest.scale, "the reference tier must be the unscaled one").toBe(1);
    const unscaled = painted.get(widest.width)!;
    expect(unscaled).toBeGreaterThan(0);

    for (const { width, scale } of LADDER) {
      expect(painted.get(width), `painted die width at ${String(width)}px`).toBeCloseTo(unscaled * scale, 1);
    }
  });

  /**
   * `transform-origin: top left` is what makes the painted scene land ON the
   * sized box instead of centred over it. With the browser's default
   * `50% 50%` origin a 0.45-scaled scene still paints in the middle of the
   * 210px area it lays out, spilling out of a 94.5px box on every side —
   * measurably, and invisibly to every assertion above.
   */
  it.each(LADDER)("at $width px the painted scene lands exactly on its sized box, corner for corner", async ({ width }) => {
    await page.viewport(width, 900);
    const handle = mountRolledCup();

    for (const box of handle.trayElement.querySelectorAll<HTMLElement>(".hexdev-dice-scene-box")) {
      const scene = box.querySelector<HTMLElement>(".hexdev-dice-scene");
      expect(scene, "expected a .hexdev-dice-scene inside its box").not.toBeNull();
      const boxRect = box.getBoundingClientRect();
      const sceneRect = scene!.getBoundingClientRect();
      expect(sceneRect.left).toBeCloseTo(boxRect.left, 1);
      expect(sceneRect.top).toBeCloseTo(boxRect.top, 1);
      expect(sceneRect.width).toBeCloseTo(boxRect.width, 1);
      expect(sceneRect.height).toBeCloseTo(boxRect.height, 1);
    }
  });
});

describe("dice: a die still knows its own size where nothing above it declares one", () => {
  /**
   * THE FENCE FOR `var(--dice-scene-scale, 1)`'s OWN FALLBACK, written
   * because deleting that fallback left the whole behavioural suite green.
   * Above the ladder's widest tier no rule declares `--dice-scene-scale` at
   * all, so `calc(DIE_SCENE_SIZE * var(--dice-scene-scale))` without a
   * fallback is invalid at computed-value time and the width falls back to
   * `auto` — and inside the flex tray every test above measures `auto` at
   * exactly `DIE_SCENE_SIZE` anyway, because the scene it contains is that
   * size. The two implementations are indistinguishable there.
   *
   * They are not indistinguishable in a BLOCK container, which is where a
   * die is mounted the moment it stops being one of five in a flex row: a
   * `width: auto` block fills its container, so a die dropped into a 500px
   * cell would lay out a 500px-wide box around a 210px drawing and push
   * everything beside it out of the way. This is not a hypothetical
   * mounting — it is exactly the shape a board composing one die per
   * control will use.
   *
   * The scene's own `transform: scale(var(--dice-scene-scale, 1))` fallback
   * is deliberately NOT fenced here, and that is a finding rather than a
   * gap: it can only ever be taken when the property is undefined
   * everywhere, and `scale(1)` and no transform at all paint identically —
   * `.hexdev-dice-scene` already establishes its own stacking context and
   * containing block through `perspective`. It is written for symmetry and
   * for the reader, and there is nothing there for a test to observe.
   */
  it("measures exactly DIE_SCENE_SIZE inside a block container far wider than it, with no ancestor declaring the scale", async () => {
    await page.viewport(1280, 900);
    ensureDiceStyles(document);

    const host = document.createElement("div");
    host.style.width = "500px";
    document.body.appendChild(host);
    mounted.push(host);

    const box = createDieSceneElement(document, 4, 0);
    host.appendChild(box);

    const rect = box.getBoundingClientRect();
    expect(rect.width, "a die is self-sizing; it never inherits its container's width").toBeCloseTo(DIE_SCENE_SIZE, 1);
    expect(rect.height).toBeCloseTo(DIE_SCENE_SIZE, 1);
  });
});
