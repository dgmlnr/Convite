import { describe, expect, it } from "vitest";
import { CUP_TAP_MIN, DIE_REST_TILT } from "./geometry.js";
import { buildDiceStylesheet } from "./dice-styles.js";

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
});

describe("dice-styles: the cosmetic cube tilt is one static rule, never mixed into the per-face pose", () => {
  it("declares .hexdev-dice-tilt's rotation from DIE_REST_TILT, literally, not from a var() a per-face write could override", () => {
    const css = buildDiceStylesheet();
    const rule = css.match(/\.hexdev-dice-tilt\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain(`rotateX(${String(DIE_REST_TILT.rotateX)}deg)`);
    expect(rule).toContain(`rotateY(${String(DIE_REST_TILT.rotateY)}deg)`);
    // No var(--dice-rest-…) read here — that pair belongs to
    // .hexdev-dice-cube alone; a tilt rule that read it too would double the
    // per-face rotation into the outer element as well.
    expect(rule).not.toContain("var(--dice-rest");
  });

  it("re-declares transform-style: preserve-3d — it does not inherit, and without it the cube's facelets would flatten", () => {
    const css = buildDiceStylesheet();
    const rule = css.match(/\.hexdev-dice-tilt\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/transform-style:\s*preserve-3d/);
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
