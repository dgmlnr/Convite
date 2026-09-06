import { afterEach, describe, expect, it } from "vitest";
import { getDieFaceArtUrl } from "./art.js";
import { DIE_SIDE_FACE, DIE_SIDE_ORDER, FACE_ROTATION } from "./geometry.js";
import { createDieSceneElement } from "./die.js";

const mounted: HTMLElement[] = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
});

/**
 * THE WRITE-ORDER PROOF, AT THE ACTUAL DOM LEVEL rather than only on the
 * pure string function. `geometry.test.ts` already proves
 * `restingPoseDeclaration` computes the right string; this proves
 * `createDieSceneElement` actually PUTS that string on the element, and
 * — the part a pure-function test cannot show — that it is already there
 * the instant the function returns, with no animation frame, no
 * `requestAnimationFrame`, nothing awaited in between. A real screen-reader
 * or a fast eye would notice a one-frame flash of the wrong pose exactly as
 * much as a permanently wrong one; this is the fence for that gap.
 */
describe("die: the resting pose is on the element before this function ever returns", () => {
  it.each([1, 2, 3, 4, 5, 6] as const)("face %s: the cube's style already carries its own FACE_ROTATION entry, synchronously", (face) => {
    const scene = createDieSceneElement(document, face, 0);
    // Not appended to the document yet, and not a single microtask has run —
    // if the pose were written asynchronously this assertion would still see
    // the pre-write state.
    const cube = scene.querySelector<HTMLElement>(".hexdev-dice-cube")!;
    const { rotateX, rotateY } = FACE_ROTATION[face];
    expect(cube.style.getPropertyValue("--dice-rest-x").trim()).toBe(`${String(rotateX)}deg`);
    expect(cube.style.getPropertyValue("--dice-rest-y").trim()).toBe(`${String(rotateY)}deg`);
  });

  /**
   * THE COSMETIC TILT LIVES ONE ELEMENT OUT, never on the cube itself — see
   * `DIE_REST_TILT`'s own comment in `geometry.ts` for why folding it into
   * `--dice-rest-x`/`-y` broke faces 3 and 4 open into a two-face "V". This
   * proves the wrapper `die.ts` now places between the scene and the cube
   * exists, sits BETWEEN them (not, say, duplicating the cube's own class),
   * and — the point of moving it out here at all — carries no per-face
   * data of its own: unlike `cube.style`, which changes with every roll,
   * `.hexdev-dice-tilt` has no inline style and no `dataset.face`, because
   * the same static CSS rule (`dice-styles.test.ts`) applies regardless of
   * which face the cube inside it is showing.
   */
  it("wraps the cube in a static tilt element that carries no face-specific state of its own", () => {
    const scene = createDieSceneElement(document, 5, 0);
    const tilt = scene.querySelector<HTMLElement>(".hexdev-dice-tilt");
    expect(tilt, "expected a .hexdev-dice-tilt wrapper between the scene and the cube").not.toBeNull();
    const cube = tilt!.querySelector<HTMLElement>(".hexdev-dice-cube");
    expect(cube, "expected the cube to be a descendant of the tilt wrapper, not a sibling").not.toBeNull();
    expect(tilt!.style.cssText).toBe("");
    expect(tilt!.dataset.face).toBeUndefined();
  });

  it("builds all six facelets, each carrying the face its own side permanently owns", () => {
    const scene = createDieSceneElement(document, 1, 0);
    document.body.appendChild(scene);
    mounted.push(scene);
    const facelets = [...scene.querySelectorAll<HTMLElement>(".hexdev-dice-face")];
    expect(facelets.length).toBe(DIE_SIDE_ORDER.length);
    for (const side of DIE_SIDE_ORDER) {
      const facelet = scene.querySelector<HTMLElement>(`[data-side="${side}"]`);
      expect(facelet, `expected a facelet for side ${side}`).not.toBeNull();
      // A rendered WebP, not inline markup — `art.ts`'s own header explains
      // why the flat SVG this facelet used to mount is gone entirely. The
      // src must name THIS side's own permanently-assigned face, not
      // whichever face the cube happens to be resting on (face 1 here).
      const img = facelet!.querySelector("img");
      expect(img, `expected an <img> for side ${side}`).not.toBeNull();
      expect(img!.getAttribute("src")).toBe(getDieFaceArtUrl(DIE_SIDE_FACE[side]).href);
      // A permanent property of that SIDE, not of which face was rolled —
      // rolling face 6 must not change which physical side carries face 3.
      expect(facelet!.dataset.side).toBe(side);
    }
  });
});
