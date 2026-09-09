import { describe, expect, it } from "vitest";
import { CUP_ART_HEIGHT, CUP_ART_WIDTH } from "./art.js";
import { CUP_TAP_MIN } from "./geometry.js";
import {
  buildDiceStylesheet,
  CUP_PIECE_HEIGHT,
  CUP_PIECE_WIDTH,
  CUP_PIVOT_X_PERCENT,
  CUP_PIVOT_Y_PERCENT,
  CUP_SHAKE_CYCLE_MS,
  CUP_TIP_DURATION_MS,
  CUP_TIP_HOLD_PERCENT,
  CUP_TIP_POUR_PERCENT,
  DICE_TOSS_DURATION_MS,
  DICE_TOSS_STAGGER_MS,
  DIE_CUBE_SIZE,
  DIE_SCENE_SIZE,
} from "./dice-styles.js";

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

/**
 * The stylesheet with every CSS comment stripped.
 *
 * MEASURED, not a tidy-up: the three assertions below are the first in this
 * file to claim a declaration is ABSENT, and every one of them came back red
 * against the real stylesheet for the wrong reason. This package's rules
 * carry long prose blocks that QUOTE the declarations they argue about —
 * `.hexdev-dice-scene-box`'s own comment contains the words `transform:
 * scale()` and `.hexdev-dice-cube`'s contains `var(--dice-scene-scale)`,
 * both while explaining precisely why that declaration must not be there. A
 * `not.toMatch` that reads commentary asserts nothing about the shipped CSS.
 * No parser is needed: CSS comments do not nest.
 */
function declarationsOnly(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("dice-styles: the responsive tray is two elements, because one of them cannot reflow anything", () => {
  /**
   * THE MECHANICAL HALF of `dice-tray-fit.browser.test.ts`'s measured fence,
   * and the one that says WHY the recipe is two rules rather than one:
   * `transform: scale()` is paint-time and never changes a layout box, so a
   * scaled scene still occupies its full `DIE_SCENE_SIZE` in the flex row.
   * The sized box is the half that reflows; the transform is the half that
   * draws. Either one alone is a no-op or a spill.
   */
  it("puts the sized layout box on .hexdev-dice-scene-box and the paint-time scale on .hexdev-dice-scene", () => {
    const css = declarationsOnly(buildDiceStylesheet());
    const boxRule = css.match(/\.hexdev-dice-scene-box\s*\{[^}]*\}/)?.[0] ?? "";
    expect(boxRule).toContain(`width: calc(${String(DIE_SCENE_SIZE)}px * var(--dice-scene-scale, 1))`);
    expect(boxRule).toContain(`height: calc(${String(DIE_SCENE_SIZE)}px * var(--dice-scene-scale, 1))`);
    expect(boxRule, "the box is the LAYOUT half — a transform here would reflow nothing").not.toMatch(/transform:/);

    const sceneRule = css.match(/\.hexdev-dice-scene\s*\{[^}]*\}/)?.[0] ?? "";
    expect(sceneRule).toContain("transform: scale(var(--dice-scene-scale, 1))");
    expect(sceneRule).toContain("transform-origin: top left");
  });

  /**
   * The fence for the fix the exploration originally proposed and the design
   * corrected: shrinking the tray by RESIZING widths. `.hexdev-dice-scene`'s
   * own `DIE_SCENE_SIZE` and `.hexdev-dice-cube`'s own `DIE_CUBE_SIZE` are
   * both fixed pixel literals, and the cube's is the number
   * `DIE_SIDE_LOCAL_TRANSFORM`'s `translateZ` was calibrated against — a
   * `var(--dice-scene-scale)` reaching either one pulls the facelets off
   * their shared edges.
   */
  it("never lets the scale reach a width the die's own geometry is calibrated against", () => {
    const css = declarationsOnly(buildDiceStylesheet());
    const sceneRule = css.match(/\.hexdev-dice-scene\s*\{[^}]*\}/)?.[0] ?? "";
    expect(sceneRule).toContain(`width: ${String(DIE_SCENE_SIZE)}px`);
    expect(sceneRule).not.toMatch(/width:\s*calc/);

    const cubeRule = css.match(/\.hexdev-dice-cube\s*\{[^}]*\}/)?.[0] ?? "";
    expect(cubeRule).toContain(`width: ${String(DIE_CUBE_SIZE)}px`);
    expect(cubeRule).not.toMatch(/--dice-scene-scale/);

    const faceRule = css.match(/\.hexdev-dice-face\s*\{[^}]*\}/)?.[0] ?? "";
    expect(faceRule).not.toMatch(/--dice-scene-scale/);
  });

  /**
   * A LADDER THAT ONLY EVER SHRINKS, and only at width breakpoints —
   * `prefers-reduced-motion` blocks are `@media` too and must not be counted
   * among them, which is why this reads the width queries specifically.
   */
  it("declares a strictly shrinking --dice-scene-scale at narrowing width breakpoints, and never above 1", () => {
    const css = declarationsOnly(buildDiceStylesheet());
    const tiers = [...css.matchAll(/@media \(max-width:\s*(\d+)px\)\s*\{\s*\.hexdev-dice-scene-box\s*\{\s*--dice-scene-scale:\s*([\d.]+);/g)].map((m) => ({
      maxWidth: Number(m[1]),
      scale: Number(m[2]),
    }));
    expect(tiers.length, "expected at least two width tiers below the unscaled default").toBeGreaterThanOrEqual(2);
    for (const { scale } of tiers) {
      expect(scale).toBeGreaterThan(0);
      expect(scale).toBeLessThan(1);
    }
    // Narrower must never be bigger. Written as a sort-independent check so
    // reordering the blocks in the stylesheet cannot quietly satisfy it.
    const byWidth = [...tiers].sort((a, b) => a.maxWidth - b.maxWidth);
    for (let i = 1; i < byWidth.length; i++) {
      expect(byWidth[i]!.scale).toBeGreaterThan(byWidth[i - 1]!.scale);
    }
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

/**
 * Every keyframe stop of one animation, as `{ at, transform }` pairs, read
 * out of the built stylesheet rather than out of the constants that wrote it.
 * A selector-and-percentage parse is enough here because these two keyframes
 * hold plain transform lists with no nested `calc()` — unlike
 * `extractTurnOffset` at the top of this file, which needs the toss's exact
 * literal shape precisely because `rotateX(calc(...))` defeats a generic
 * paren capture.
 */
function keyframeStops(css: string, name: string): { at: string; transform: string }[] {
  const block = new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css);
  if (block === null) throw new Error(`no @keyframes ${name} in the stylesheet`);
  return [...block[1]!.matchAll(/([\d%,\s]+)\{\s*transform:\s*([^;]+);/g)].map((m) => ({ at: m[1]!.trim(), transform: m[2]!.trim() }));
}

function ruleFor(css: string, selector: string): string {
  const rule = new RegExp(`${selector.replace(/[.[\]"]/g, "\\$&")}\\s*\\{[^}]*\\}`).exec(css);
  if (rule === null) throw new Error(`no rule for ${selector} in the stylesheet`);
  return rule[0];
}

/**
 * THE CUP'S VERSION OF THE ONE CONTRACT THIS PACKAGE EXISTS TO HOLD.
 *
 * A die's toss may not decide a face, and the mechanism that guarantees it is
 * that the keyframe's `from` state is the rest pose plus whole turns — the
 * same two `var()` reads, never independent numbers. A cup's gesture has the
 * same shape of obligation for a different reason: nothing about a cup is
 * decided, so what a stray number would break is not correctness but
 * CONTINUITY. A tip whose first stop is not exactly where the cup already
 * sits snaps on frame one and snaps back at the end, twice per throw, and no
 * test that only reads the constants could see it — both halves would be read
 * from the same constant and agree with each other while disagreeing with the
 * shipped CSS. These read the built stylesheet back.
 */
describe("dice-styles: the cup's gesture begins and ends exactly where the cup already stands", () => {
  it("anchors both ends of the tip to the very same transform the resting rule declares", () => {
    const css = declarationsOnly(buildDiceStylesheet());
    const rest = /transform:\s*([^;]+);/.exec(ruleFor(css, ".hexdev-dice-cup-piece"));
    expect(rest, "expected a transform: declaration on .hexdev-dice-cup-piece").not.toBeNull();

    const stops = keyframeStops(css, "hexdev-dice-cup-tip");
    const first = stops.find((stop) => stop.at === "0%");
    const last = stops.find((stop) => stop.at === "100%");
    expect(first, "expected a 0% stop").toBeDefined();
    expect(last, "expected a 100% stop").toBeDefined();
    expect(first!.transform).toBe(rest![1]!.trim());
    expect(last!.transform).toBe(rest![1]!.trim());
  });

  it("anchors the shake's own wrap-around stop to it too, so a loop never jumps at the seam", () => {
    const css = declarationsOnly(buildDiceStylesheet());
    const rest = /transform:\s*([^;]+);/.exec(ruleFor(css, ".hexdev-dice-cup-piece"))![1]!.trim();
    const stops = keyframeStops(css, "hexdev-dice-cup-shake");
    const wrap = stops.find((stop) => stop.at === "0%,\n  100%" || stop.at.replace(/\s+/g, "") === "0%,100%");
    expect(wrap, "expected the shake to open and close on one shared stop").toBeDefined();
    expect(wrap!.transform).toBe(rest);
  });

  /**
   * The same shape-matching lesson `.hexdev-dice-cube`'s own fence above
   * enforces, applied where it is cheap rather than where it was expensive.
   * For the cube it is load-bearing — a mismatched list forces matrix
   * decomposition and collapses a multi-turn spin. For a 2D translate-plus-
   * rotate the decomposition is exact and nothing would visibly break, which
   * is precisely why the rule needs stating: a reader comparing these two
   * has no way to know the difference, and should not have to.
   */
  it("keeps every stop of both gestures the same transform-function shape as the resting rule — translate, then rotate", () => {
    const css = declarationsOnly(buildDiceStylesheet());
    const shapeOf = (transform: string): string[] => [...transform.matchAll(/(translate|rotate)\(/g)].map((m) => m[1]!);
    const rest = /transform:\s*([^;]+);/.exec(ruleFor(css, ".hexdev-dice-cup-piece"))![1]!;
    expect(shapeOf(rest)).toEqual(["translate", "rotate"]);

    for (const name of ["hexdev-dice-cup-shake", "hexdev-dice-cup-tip"]) {
      const stops = keyframeStops(css, name);
      expect(stops.length, `expected ${name} to have stops`).toBeGreaterThan(2);
      for (const stop of stops) {
        expect(shapeOf(stop.transform), `${name} at ${stop.at}`).toEqual(["translate", "rotate"]);
      }
    }
  });

  /** A gesture that never leaves the rest pose would satisfy every anchoring
   * assertion above and animate nothing at all — the same vacuity the toss's
   * own `expect(x.constantDeg).not.toBe(0)` guards against. */
  it("actually moves: at least one stop of each gesture differs from the rest pose", () => {
    const css = declarationsOnly(buildDiceStylesheet());
    const rest = /transform:\s*([^;]+);/.exec(ruleFor(css, ".hexdev-dice-cup-piece"))![1]!.trim();
    for (const name of ["hexdev-dice-cup-shake", "hexdev-dice-cup-tip"]) {
      expect(keyframeStops(css, name).some((stop) => stop.transform !== rest), name).toBe(true);
    }
  });
});

describe("dice-styles: the cup stays over for as long as dice are still leaving it", () => {
  /**
   * THE ONE PLACE THE CUP'S CLOCK AND THE DICE'S CLOCK HAVE TO AGREE, and
   * they agree by arithmetic rather than by being the same number.
   *
   * `die.ts` writes `--i` as a tray index, and this file already reads that
   * range as 0..4 one describe block up (the toss's own whole-turn fence
   * loops over exactly those five). The last die therefore starts its flight
   * four staggers late — and a cup that has straightened up before then is a
   * cup a die is visibly falling out of the side of.
   *
   * Both sides are literals (`CUP_TIP_DURATION_MS`, `CUP_TIP_HOLD_PERCENT`,
   * `DICE_TOSS_STAGGER_MS`), which is what makes this a fence: shorten the
   * tip or lengthen the stagger and it goes red, where a `CUP_TIP_DURATION_MS
   * = DICE_TOSS_STAGGER_MS * k` would have stayed green through both.
   */
  it("holds the mouth down past the instant the last of five dice starts its own flight", () => {
    const lastDieLeavesAtMs = DICE_TOSS_STAGGER_MS * 4;
    const holdEndsAtMs = (CUP_TIP_DURATION_MS * CUP_TIP_HOLD_PERCENT) / 100;
    expect(holdEndsAtMs).toBeGreaterThan(lastDieLeavesAtMs);
  });

  it("gets the mouth all the way down well before that, so the first die does not leave a still-upright cup", () => {
    const pourDoneAtMs = (CUP_TIP_DURATION_MS * CUP_TIP_POUR_PERCENT) / 100;
    expect(pourDoneAtMs).toBeLessThan(DICE_TOSS_STAGGER_MS * 2);
    expect(CUP_TIP_POUR_PERCENT).toBeLessThan(CUP_TIP_HOLD_PERCENT);
  });

  /** The cup is back on its base before the dice have finished tumbling —
   * see `CUP_TIP_DURATION_MS`'s own comment for why that order and not the
   * other one. */
  it("finishes before the last die does", () => {
    expect(CUP_TIP_DURATION_MS).toBeLessThan(DICE_TOSS_DURATION_MS + DICE_TOSS_STAGGER_MS * 4);
  });

  it("emits those two checkpoints as the tip's actual keyframe percentages, not merely as constants nothing reads", () => {
    const stops = keyframeStops(declarationsOnly(buildDiceStylesheet()), "hexdev-dice-cup-tip").map((stop) => stop.at);
    expect(stops).toContain(`${String(CUP_TIP_POUR_PERCENT)}%`);
    expect(stops).toContain(`${String(CUP_TIP_HOLD_PERCENT)}%`);
  });
});

describe("dice-styles: the cubilete is a piece, not a second control", () => {
  it("sizes it at the exported box, through the knob that shrinks it, and never borrows the button's tap floor or its pointer cursor", () => {
    const css = declarationsOnly(buildDiceStylesheet());
    const rule = ruleFor(css, ".hexdev-dice-cup-piece");
    // THE LAYOUT BOX AND THE LADDER IN ONE DECLARATION, which is the whole
    // difference from how a die shrinks: a cup is one flat image under
    // `object-fit: contain` and can be RESIZED, where a die's facelets are
    // held at their shared edges by a fixed `translateZ` and can only be
    // drawn smaller. A bare `width: 124px` here would be a cup that never
    // makes room for anything.
    expect(rule).toContain(`width: calc(${String(CUP_PIECE_WIDTH)}px * var(--dice-cup-scale, 1))`);
    expect(rule).toContain(`height: calc(${String(CUP_PIECE_HEIGHT)}px * var(--dice-cup-scale, 1))`);
    expect(rule, "the box IS the ladder here — a transform would reflow nothing").not.toMatch(/transform:\s*scale/);
    expect(rule, "scenery must not offer a cursor nothing can act on").not.toMatch(/cursor:/);
    expect(rule).not.toMatch(/min-width:/);
  });

  /**
   * THE BOX AND THE ARTWORK ARE THE SAME SHAPE. `object-fit: contain` makes a
   * mismatch letterboxes rather than distort, which is the good failure mode
   * and also the invisible one: a re-rendered cup at a different aspect would
   * simply start painting smaller inside its own box, on every board, with
   * nothing to say so. `art.test.ts` already fences CUP_ART_WIDTH/-HEIGHT
   * against the real file, so this closes the chain from the file to the box.
   */
  it("keeps the piece's box at the artwork's own aspect ratio", () => {
    expect(CUP_PIECE_WIDTH / CUP_PIECE_HEIGHT).toBeCloseTo(CUP_ART_WIDTH / CUP_ART_HEIGHT, 2);
  });

  it("pivots both gestures about the drawn cubilete's own middle, not the box's", () => {
    const rule = ruleFor(declarationsOnly(buildDiceStylesheet()), ".hexdev-dice-cup-piece");
    expect(rule).toContain(`transform-origin: ${String(CUP_PIVOT_X_PERCENT)}% ${String(CUP_PIVOT_Y_PERCENT)}%`);
    expect(CUP_PIVOT_Y_PERCENT, "the artwork's opaque middle sits well below the box's own centre").toBeGreaterThan(50);
  });

  /** One attribute, three values — so "shaking" and "tipping" cannot both be
   * in force, which two class names could. */
  it("selects each gesture off one data attribute rather than off classes that could stack", () => {
    const css = declarationsOnly(buildDiceStylesheet());
    expect(css).toContain('.hexdev-dice-cup-piece[data-cup-gesture="shaking"]');
    expect(css).toContain('.hexdev-dice-cup-piece[data-cup-gesture="tipping"]');
    expect(css, "still is the absence of an animation, never a rule of its own").not.toContain('[data-cup-gesture="still"]');
  });

  it("loops the shake and plays the tip exactly once", () => {
    const css = declarationsOnly(buildDiceStylesheet());
    expect(ruleFor(css, '.hexdev-dice-cup-piece[data-cup-gesture="shaking"]')).toMatch(/animation:[^;]*\binfinite\b/);
    expect(ruleFor(css, '.hexdev-dice-cup-piece[data-cup-gesture="tipping"]')).not.toMatch(/animation:[^;]*\binfinite\b/);
  });

  it("runs each gesture at its own exported duration", () => {
    const css = declarationsOnly(buildDiceStylesheet());
    expect(ruleFor(css, '.hexdev-dice-cup-piece[data-cup-gesture="shaking"]')).toContain(`${String(CUP_SHAKE_CYCLE_MS)}ms`);
    expect(ruleFor(css, '.hexdev-dice-cup-piece[data-cup-gesture="tipping"]')).toContain(`${String(CUP_TIP_DURATION_MS)}ms`);
  });

  /**
   * The reduced-motion answer for the cup, fenced the way the cube's already
   * is — by joining EVERY block rather than reading the first, which is the
   * mistake `table-styles.test.ts` records paying for. The gesture rule sits
   * in the same block as the button's `transition: none`, so a fence reading
   * only up to the first closing brace pair would have missed it entirely.
   */
  it("turns every gesture off under prefers-reduced-motion, leaving the resting pose as the whole picture", () => {
    const css = buildDiceStylesheet();
    const joined = [...css.matchAll(/@media \(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\}\s*\}/g)].map((m) => m[0]).join("\n");
    const rule = /\.hexdev-dice-cup-piece\[data-cup-gesture\]\s*\{[^}]*\}/.exec(joined);
    expect(rule, "expected the cup piece's gestures to be disabled under reduced motion").not.toBeNull();
    expect(rule![0]).toMatch(/animation:\s*none/);
  });
});

describe("dice-styles: the cubilete shrinks on the same ladder the dice do", () => {
  /** Every `@media (max-width: N) { <selector> { <property>: <value>; }` in
   * the built stylesheet, as `N -> value`. Written against the exact literal
   * shape this file emits, the same licence `extractTurnOffset` at the top
   * takes for the toss keyframe: this is the one file allowed to know it. */
  function tiersOf(css: string, className: string, property: string): Map<number, number> {
    const pattern = new RegExp(String.raw`@media \(max-width:\s*(\d+)px\)\s*\{\s*\.${className}\s*\{\s*${property}:\s*([\d.]+);`, "g");
    return new Map([...css.matchAll(pattern)].map((m) => [Number(m[1]), Number(m[2])] as const));
  }

  /**
   * ONE LADDER READ TWICE, not two that happen to share numbers — the same
   * claim `tray-styles.ts` makes about the container axis, checked here for
   * the viewport one: whatever widths the dice step at, the cup steps at
   * exactly those and no others.
   */
  it("steps at exactly the widths the dice step at", () => {
    const css = declarationsOnly(buildDiceStylesheet());
    const dice = [...tiersOf(css, "hexdev-dice-scene-box", "--dice-scene-scale").keys()].sort((a, b) => a - b);
    const cup = [...tiersOf(css, "hexdev-dice-cup-piece", "--dice-cup-scale").keys()].sort((a, b) => a - b);
    expect(dice.length, "expected the dice's own width tiers").toBeGreaterThanOrEqual(2);
    expect(cup).toEqual(dice);
  });

  /**
   * AND IT GIVES UP LESS ROOM THAN THEY DO, at every rung. A cubilete is a
   * bigger object than a die and has to keep reading as one; at the dice's
   * own scales it would come out smaller than the dice it just poured, which
   * is the one thing a cubilete cannot look like. Written as a comparison
   * rather than as two literals so it stays true through a re-tuning of
   * either ladder.
   */
  it("keeps a gentler scale than the dice at every rung", () => {
    const css = declarationsOnly(buildDiceStylesheet());
    const dice = tiersOf(css, "hexdev-dice-scene-box", "--dice-scene-scale");
    const cup = tiersOf(css, "hexdev-dice-cup-piece", "--dice-cup-scale");
    expect(cup.size).toBe(dice.size);
    expect(cup.size).toBeGreaterThanOrEqual(2);
    for (const [width, cupScale] of cup) {
      expect(cupScale, `at ${String(width)}px`).toBeGreaterThan(dice.get(width)!);
      expect(cupScale).toBeLessThan(1);
    }
  });
});
