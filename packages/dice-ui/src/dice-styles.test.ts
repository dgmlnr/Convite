import { describe, expect, it } from "vitest";
import { CUP_TAP_MIN } from "./geometry.js";
import { buildDiceStylesheet, DIE_SCENE_SIZE } from "./dice-styles.js";

/**
 * Pulls one axis's whole-turn offset straight out of the toss keyframe's
 * `from` text — e.g. finds `rotateX(calc(var(--dice-rest-x, 0deg) + 720deg +
 * var(--i, 0) * 360deg))` and yields `{ constantDeg: 720, perIDeg: 360 }`.
 * Anchored to the exact literal shape `dice-styles.ts` emits (this is the ONE
 * file allowed to know that shape) rather than a generic paren-balancing
 * parse, since `rotateX(calc(...))`'s nested parens make a generic `[^)]*`
 * capture stop at the wrong `)`.
 */
function extractTurnOffset(from: string, axis: "rotateX" | "rotateY", restVar: "--dice-rest-x" | "--dice-rest-y"): { constantDeg: number; perIDeg: number } {
  const re = new RegExp(`${axis}\\(calc\\(var\\(${restVar}, 0deg\\) \\+ (-?\\d+)deg \\+ var\\(--i, 0\\) \\* (-?\\d+)deg\\)\\)`);
  const m = re.exec(from);
  if (m === null) {
    throw new Error(`could not find a whole-turn ${axis} offset in: ${from}`);
  }
  return { constantDeg: Number(m[1]), perIDeg: Number(m[2]) };
}

/**
 * THE MECHANICAL HALF OF THE DETERMINISM CONTRACT — no rendering required,
 * the same regex-on-generated-CSS technique `table-styles.test.ts` already
 * uses for its own reduced-motion fence.
 */
describe("dice-styles: the toss keyframe can never disagree with the resting pose", () => {
  it("anchors the toss's flight pose to the SAME two custom properties the resting rule reads, not to independent numbers", () => {
    const css = buildDiceStylesheet();
    const keyframe = /@keyframes hexdev-dice-toss\s*\{\s*from\s*\{([\s\S]*?)\}\s*\}/.exec(css);
    expect(keyframe, "expected an hexdev-dice-toss keyframe to exist").not.toBeNull();
    const from = keyframe![1]!;
    expect(from).toContain("var(--dice-rest-x");
    expect(from).toContain("var(--dice-rest-y");
  });

  it("reads the same two properties in the cube's own resting rule", () => {
    const css = buildDiceStylesheet();
    const rule = /\.hexdev-dice-cube\s*\{([\s\S]*?)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain("var(--dice-rest-x");
    expect(rule![1]).toContain("var(--dice-rest-y");
  });

  /**
   * THE VISUAL HALF OF THE FIX, MECHANICALLY FENCED. A cube that genuinely
   * spins through other faces before landing needs the browser to
   * interpolate `rotateX`/`rotateY`'s own arguments component-wise, and that
   * only happens when the `from` keyframe and the cube's own resting
   * transform are the SAME transform-function shape — `translateY`,
   * `rotateX`, `rotateY`, in that order, on both sides. Drop the resting
   * rule's own `translateY(0px)` (or reorder either list) and nothing here
   * fails loudly: the browser silently falls back to matrix decomposition,
   * and the toss goes back to tilting-and-straightening instead of turning —
   * exactly the regression `hexdev-dice-toss`'s own module comment describes
   * at length. This test is the fence for that regression.
   */
  it("keeps the cube's resting transform the same function shape as the keyframe's from state — translateY, rotateX, rotateY, in that order", () => {
    const css = buildDiceStylesheet();
    const rule = /\.hexdev-dice-cube\s*\{([\s\S]*?)\}/.exec(css);
    expect(rule, "expected a .hexdev-dice-cube rule").not.toBeNull();
    const restLine = /transform:\s*([^;]+);/.exec(rule![1]!);
    expect(restLine, "expected a transform: declaration on .hexdev-dice-cube").not.toBeNull();

    const keyframe = /@keyframes hexdev-dice-toss\s*\{\s*from\s*\{([\s\S]*?)\}\s*\}/.exec(css);
    expect(keyframe, "expected an hexdev-dice-toss keyframe to exist").not.toBeNull();

    const shapeOf = (transform: string): string[] => [...transform.matchAll(/(translateY|rotateX|rotateY)\(/g)].map((m) => m[1]!);
    expect(shapeOf(restLine![1]!)).toEqual(["translateY", "rotateX", "rotateY"]);
    expect(shapeOf(keyframe![1]!)).toEqual(["translateY", "rotateX", "rotateY"]);
  });

  /**
   * THE ARITHMETIC HALF OF THE FIX. `hexdev-dice-toss`'s own module comment
   * argues that adding only WHOLE multiples of 360deg to each rest angle is
   * what lets the flight genuinely sweep through other faces while still
   * converging on the exact orientation `FACE_ROTATION` decided — a
   * non-whole offset (the OLD `+ 640deg`/`+ 460deg`, neither a multiple of
   * 360) would land on a DIFFERENT orientation than the one written to
   * `--dice-rest-x`/`-y`, silently reopening the "cannot be repainted after
   * the fact" contract this whole file exists to hold. This test proves the
   * offset actually shipped is a whole turn on both axes, and stays one for
   * every `--i` `die.ts` ever writes (0 through 4, one per tray slot) — not
   * merely for `--i: 0`.
   */
  it("adds only whole multiples of 360deg to each rest angle, for both the base offset and every die's own --i, so every die lands exactly on FACE_ROTATION's pose", () => {
    const css = buildDiceStylesheet();
    const keyframe = /@keyframes hexdev-dice-toss\s*\{\s*from\s*\{([\s\S]*?)\}\s*\}/.exec(css);
    expect(keyframe).not.toBeNull();
    const from = keyframe![1]!;

    const x = extractTurnOffset(from, "rotateX", "--dice-rest-x");
    const y = extractTurnOffset(from, "rotateY", "--dice-rest-y");

    for (const { constantDeg, perIDeg } of [x, y]) {
      expect(constantDeg % 360).toBe(0);
      expect(perIDeg % 360).toBe(0);
    }
    // A real turn, not a whole-multiple-of-360 way of writing zero — a
    // keyframe that "fixed" the arithmetic by adding 0deg would pass every
    // assertion above and still never move.
    expect(x.constantDeg).not.toBe(0);
    expect(y.constantDeg).not.toBe(0);

    for (let i = 0; i <= 4; i++) {
      expect((x.constantDeg + i * x.perIDeg) % 360).toBe(0);
      expect((y.constantDeg + i * y.perIDeg) % 360).toBe(0);
    }
  });
});

describe("dice-styles: the die rests square and front-on, with no cosmetic tilt rule composed on top", () => {
  it("declares no .hexdev-dice-tilt rule — a resting cube reads FACE_ROTATION's pose directly, undeformed by an outer rotation", () => {
    const css = buildDiceStylesheet();
    expect(css).not.toMatch(/\.hexdev-dice-tilt\s*\{/);
  });

  it("still declares transform-style: preserve-3d on the cube itself, so the toss animation keeps showing a real cube in motion", () => {
    const css = buildDiceStylesheet();
    const rule = css.match(/\.hexdev-dice-cube\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/transform-style:\s*preserve-3d/);
  });
});

describe("dice-styles: the flight's own box is bigger than — and no longer tied to — the cube's own size", () => {
  /**
   * `.hexdev-dice-cube` used to be `width: 100%; height: 100%` of
   * `.hexdev-dice-scene`, which was safe only because the two were the SAME
   * number (110px). `DIE_SCENE_SIZE` growing the scene to hold a rotating
   * cube's own wider projection would, if the cube still tracked it, pull
   * every facelet's fixed `translateZ` push out of sync with its own now-
   * bigger size — see `.hexdev-dice-cube`'s own comment for the full
   * argument. This is the mechanical fence for that decoupling actually
   * having happened: a fixed pixel size on the cube, a bigger one on the
   * scene, not a percentage anywhere between them.
   */
  it("gives the cube a fixed pixel size rather than a percentage of the (now much bigger) scene", () => {
    const css = buildDiceStylesheet();
    const rule = css.match(/\.hexdev-dice-cube\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).not.toMatch(/width:\s*100%/);
    expect(rule).not.toMatch(/height:\s*100%/);
    expect(rule).toMatch(/width:\s*\d+px/);
    expect(rule).toMatch(/height:\s*\d+px/);
  });

  it("sizes .hexdev-dice-scene at the exported DIE_SCENE_SIZE, strictly larger than the cube's own fixed box", () => {
    const css = buildDiceStylesheet();
    const sceneRule = css.match(/\.hexdev-dice-scene\s*\{[^}]*\}/)?.[0] ?? "";
    expect(sceneRule).toContain(`width: ${String(DIE_SCENE_SIZE)}px`);
    expect(sceneRule).toContain(`height: ${String(DIE_SCENE_SIZE)}px`);

    const cubeRule = css.match(/\.hexdev-dice-cube\s*\{[^}]*\}/)?.[0] ?? "";
    const cubeWidth = /width:\s*(\d+)px/.exec(cubeRule);
    expect(cubeWidth, "expected a fixed px width on .hexdev-dice-cube").not.toBeNull();
    expect(DIE_SCENE_SIZE).toBeGreaterThan(Number(cubeWidth![1]));
  });

  it("still crops the scene (overflow: hidden) and centers the smaller cube inside it", () => {
    const css = buildDiceStylesheet();
    const sceneRule = css.match(/\.hexdev-dice-scene\s*\{[^}]*\}/)?.[0] ?? "";
    expect(sceneRule).toMatch(/overflow:\s*hidden/);
    expect(sceneRule).toMatch(/align-items:\s*center/);
    expect(sceneRule).toMatch(/justify-content:\s*center/);
  });
});

describe("dice-styles: reduced motion turns the toss off without a separate 'already landed' rule", () => {
  /**
   * EVERY reduced-motion block, not the first one — `table-styles.test.ts`'s
   * own fence exists because a version of it once read only the first match
   * and stayed green while a LATER block silently broke. There are two
   * blocks here (the cube's animation, the cup's transition); joining all of
   * them is what keeps this fence honest as a third one is ever added.
   */
  it("disables the cube's toss animation entirely under prefers-reduced-motion", () => {
    const css = buildDiceStylesheet();
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\}\s*\}/g)].map((m) => m[0]);
    const joined = blocks.join("\n");
    expect(joined.length, "expected at least one @media (prefers-reduced-motion: reduce) block").toBeGreaterThan(0);
    const cubeRule = joined.match(/\.hexdev-dice-cube\s*\{[^}]*\}/)?.[0] ?? "";
    expect(cubeRule).toMatch(/animation:\s*none/);
  });

  it("also disables the cup's press transition, so a reduced-motion user gets no residual scale animation", () => {
    const css = buildDiceStylesheet();
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\}\s*\}/g)].map((m) => m[0]);
    const joined = blocks.join("\n");
    const cupRule = joined.match(/\.hexdev-dice-cup\s*\{[^}]*\}/)?.[0] ?? "";
    expect(cupRule).toMatch(/transition:\s*none/);
  });
});

describe("dice-styles: the cup's own tap surface meets the accessibility floor in its literal CSS", () => {
  it("declares min-width and min-height at the exported CUP_TAP_MIN, not merely a visually-larger size that happens to exceed it", () => {
    const css = buildDiceStylesheet();
    const cupRule = css.match(/\.hexdev-dice-cup\s*\{[^}]*\}/)?.[0] ?? "";
    expect(cupRule).toContain(`min-width: ${String(CUP_TAP_MIN)}px`);
    expect(cupRule).toContain(`min-height: ${String(CUP_TAP_MIN)}px`);
  });

  it("gives the cup a visible focus state", () => {
    const css = buildDiceStylesheet();
    expect(css).toMatch(/\.hexdev-dice-cup:focus-visible\s*\{[^}]*outline:/);
  });
});
