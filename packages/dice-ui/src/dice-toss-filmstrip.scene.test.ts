/// <reference types="@vitest/browser/matchers" />
import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import type { DieFace } from "./geometry.js";
import { DICE_TOSS_DURATION_MS, DICE_TOSS_EASING, DICE_TOSS_STAGGER_MS, DIE_SCENE_SIZE, ensureDiceStyles } from "./dice-styles.js";
import { createDieSceneElement } from "./die.js";

/**
 * THE ANIMATION NOBODY HAS EVER SEEN — and this scene exists solely to fix
 * that, not to demonstrate anything `dice.scene.test.ts` already covers.
 *
 * `visual/setup.ts` disables every animation and transition on the page,
 * globally, with `*, *::before, *::after { animation: none !important; … }`
 * — a correct call for determinism, and `dice.scene.test.ts`'s own docstring
 * says so plainly: every die that file has ever captured is captured AT
 * REST, in the pose `FACE_ROTATION` commits to. That is exactly right for
 * judging a face. It is exactly wrong for judging a THROW: a suite built to
 * hold every frame still cannot show a product owner what `hexdev-dice-toss`
 * (`dice-styles.ts`) actually looks like in motion, because the one thing
 * that suite guarantees is that motion never happens where it can see it.
 * Nobody reviewing a screenshot has ever watched this animation play.
 *
 * THE ANSWER IS NOT TO WATCH IT PLAY — `toMatchScreenshot` captures one
 * instant, not a video, and this suite has no video capability to add
 * without a new dependency. The answer is the same one film editors reached
 * for a century before video existed: a strip of individual frames, laid out
 * left to right, each one a still of the same motion at a different instant.
 * A person can read an arc, a spin and a landing off a handful of stills in a
 * row exactly the way they read them off a strip of physical film frames —
 * no player, no timeline scrubber, just an image.
 *
 * HOW A SINGLE FRAME IS FROZEN — AND THE TWO DEAD ENDS BEFORE IT. The first
 * attempt here reached for a pure-CSS idiom this repo already trusts:
 * `chrome-styles.ts`'s own `.hexdev-chrome-fan--dealing .hexdev-chrome-fan-
 * card` rule sets `animation-delay: calc(var(--i) * ${DEAL_STAGGER_MS}ms -
 * var(--elapsed, 0ms))` so a card rebuilt mid-deal RESUMES exactly where the
 * destroyed one left off. Pairing that same negative-delay arithmetic with
 * `animation-play-state: paused` looked like the obvious generalization —
 * "resume mid-flight" turned into "freeze mid-flight, forever". Measured
 * directly, it does not work: an animation that is ALREADY `paused` at its
 * very first style resolution — never once observed running — does not
 * reliably seed its hold time from a negative delay the way a RUNNING
 * animation does; every frame this technique produced came back showing
 * indistinguishable, nearly-landed poses regardless of the requested
 * checkpoint. `chrome-styles.ts`'s own usage never hits this, because it
 * never pairs a negative delay with `paused` — it keeps the card RUNNING,
 * resumed rather than frozen.
 *
 * The second attempt reached for the Web Animations API instead: `Animation.
 * pause()` then `Animation.currentTime = <ms>`, on the `CSSAnimation` object
 * `HTMLElement.getAnimations()` exposes for the running `hexdev-dice-toss`
 * keyframe. This one HALF worked, in a way that took a dedicated probe to
 * catch — `getComputedStyle(cube).transform` after seeking read back exactly
 * right at every checkpoint (independently reconstructed and matrix-checked
 * against `rotateX(810deg) rotateY(360deg)` for die index 0's `0ms` seek, and
 * against the plain rest `rotateX(90deg)` at `640ms`), yet every CAPTURED SCREENSHOT
 * showed the same undistorted, resting-looking face regardless of which
 * checkpoint was requested. The CSSOM value was correct; the COMPOSITED
 * PAINT inside this harness's nested test iframe was not repainting to match
 * it. Confirmed by mounting one die in an unclipped, oversized box: the
 * paint only ever showed the plain rest pose, never the dramatically
 * different oblique, airborne one the checked matrix actually described.
 *
 * The working technique keeps the seek (it is the only reliable way to ask
 * the browser "what does this keyframe interpolate to at this exact
 * instant", cubic-bezier easing and all) but stops trusting the animation to
 * PAINT that answer: it reads `getComputedStyle(cube).transform` right after
 * seeking, calls `animation.cancel()` to remove the animation from the
 * cascade entirely, and writes the captured matrix string straight onto
 * `cube.style.transform` as a plain, static, non-animated inline style — the
 * same ordinary code path every resting die in `dice.scene.test.ts` already
 * paints correctly. Re-ran the same unclipped probe with this extra step and
 * the oblique, airborne pose appeared exactly as the matrix described.
 * Nothing about the toss's own `640ms` duration, `DICE_TOSS_EASING` or
 * `backwards` fill mode is reimplemented to make this work — every frame
 * below is the browser's OWN interpolation of the exact animation
 * `dice-styles.ts` ships, only handed to the page a different way than a
 * running animation would.
 *
 * WHY THIS OVERRIDE DOES NOT WEAKEN `visual/setup.ts` ANYWHERE ELSE: the
 * global reset is `*, *::before, *::after { animation: none !important; }` —
 * a UNIVERSAL selector, the lowest possible specificity CSS has. Beating an
 * `!important` declaration requires an equally- or more-`!important` one of
 * EQUAL OR HIGHER specificity; a plain single class selector already
 * outranks the universal selector, so `.hexdev-dice-toss-strip .hexdev-dice-
 * cube { animation: … !important; }` wins wherever THAT class is present and
 * nowhere else. Every other scene, every `*.visual.test.ts` baseline, and
 * every other die this very package renders keeps inheriting the global
 * freeze untouched — this rule cannot reach them, because they never carry
 * `.hexdev-dice-toss-strip`. The override itself reinstates dice-styles.ts's
 * OWN `animation` and `animation-delay` declarations verbatim (just `
 * !important` and scoped) — nothing about the timing is reinvented here,
 * only unmuted for this one class of element.
 *
 * ONE DIE, NOT THE FIVE-DIE TRAY — a deliberate, verified retreat, not an
 * oversight. This harness renders every test inside a nested "vitest-iframe"
 * (`@vitest/browser-playwright`), and two facts about it were confirmed by
 * direct measurement while building this file: (1) `page.viewport(w, h)`
 * asking for more than this project's real, fixed browser-context window
 * (Playwright's unconfigured 1280×720 default — `vitest.visual.config.ts`
 * sets no `browser.viewport`) makes Vitest scale the ENTIRE iframe down with
 * a CSS `transform` to keep it fitting inside that window, uniformly
 * shrinking every screenshot taken inside it; and (2) content wider than
 * whatever viewport WAS requested paints as blank white past that edge, even
 * though the element's own measured bounding box correctly reports its full,
 * unclipped size. Together they mean a captured frame must fit ENTIRELY
 * inside a sub-1280×720 viewport to render at its true resolution.
 *
 * FIVE COLUMNS, NOT SIX — a second, later retreat, for the identical reason.
 * `.hexdev-dice-scene` used to be 110px; it is `DIE_SCENE_SIZE` (210px) now,
 * because a cube that actually rotates (this file's whole reason for
 * existing) projects a screen-space footprint bigger than its own resting
 * one, and `dice-styles.ts`'s own comment on that class has the measured
 * arithmetic for why 210px is the smallest box that holds every sampled
 * instant of every die's own flight without clipping it. Six columns at
 * 210px plus five 16px gaps plus 32px of padding is comfortably past the
 * same 1280px ceiling the paragraph above describes; five columns is not
 * (`5 × 210 + 4 × 16 + 32 = 1146`, well inside it). `FRAME_FRACTIONS` below
 * is five checkpoints rather than six for exactly this reason, not because
 * five was judged to be enough on its own merits — it happens to still be
 * plenty: a spin sweeping 720°+ per axis shows several different faces
 * whether sampled at five points or six. One representative die (index 0 —
 * the smallest of the five different per-die turn counts `hexdev-dice-toss`'s
 * own comment describes, and the one `--i` contributes no ANIMATION-DELAY
 * stagger for either) still answers the product owner's real question —
 * does the ARC read as a throw, does the SPIN look credible, does the LAST
 * frame land on the decided face with no correction — just without also
 * depicting the five-die stagger's own "does this look choreographed"
 * question inside the same still image. That gap is named plainly in this
 * change's own report, not hidden here.
 *
 * NOT A REGRESSION FENCE. Like every other `*.scene.test.ts` in this repo
 * (`vitest.scenes.config.ts`'s own header), this renders through `pnpm
 * visual:review` with `--update` and compares against nothing; the image is
 * gitignored and exists for a human to open and judge, never for `pixelmatch`
 * to pass or fail.
 */

const FILMSTRIP_CLASS = "hexdev-dice-toss-strip";
const FILMSTRIP_OVERRIDE_ID = "hexdev-dice-toss-strip-override";

/**
 * The one rule this scene needs and no other scene does — see the module
 * docstring's "WHY THIS OVERRIDE…" section for why its specificity is enough
 * to beat `visual/setup.ts` without touching that file, and why that victory
 * stays scoped to `.hexdev-dice-toss-strip` alone. Play state is left at its
 * default (`running`) here on purpose — this scene freezes each cube
 * explicitly via the Web Animations API below, not through CSS.
 */
function ensureFilmstripOverride(doc: Document): void {
  if (doc.getElementById(FILMSTRIP_OVERRIDE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = FILMSTRIP_OVERRIDE_ID;
  style.textContent = `
    .${FILMSTRIP_CLASS} .hexdev-dice-cube {
      animation: hexdev-dice-toss ${String(DICE_TOSS_DURATION_MS)}ms ${DICE_TOSS_EASING} backwards !important;
      animation-delay: calc(var(--i, 0) * ${String(DICE_TOSS_STAGGER_MS)}ms) !important;
    }
  `;
  doc.head.appendChild(style);
}

/** One rendering opportunity, awaited so the browser has actually created a
 * `CSSAnimation` for every `.hexdev-dice-cube` the loop below just mounted
 * before anything tries to `getAnimations()` on one — an animation created
 * in the same synchronous task that reads it back is not guaranteed to
 * exist yet. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/** One face from `dice.scene.test.ts`'s own phone-width roll (`[3, 5, 5, 2,
 * 6]`) — a reviewer who has already seen that scene's resting shot
 * recognises the same decided die landing here, mid-flight. */
const FACE: DieFace = 3;

/**
 * FIVE CHECKPOINTS, NOT SIX — see the module docstring's "FIVE COLUMNS, NOT
 * SIX" section for why the harness's own fixed 1280px-wide window is what
 * capped this, not a judgment that five is somehow the right number of
 * frames to look at a spin with.
 */
const FRAME_FRACTIONS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

const STRIP_GAP_PX = 16;
const STRIP_PADDING_PX = 16;
/**
 * Computed, not hand-copied — the same "one number read twice" reasoning
 * `DICE_TOSS_DURATION_MS`'s own comment in `dice-styles.ts` argues for. A
 * future bump to `DIE_SCENE_SIZE` or to `FRAME_FRACTIONS`' own length would
 * otherwise silently blow past the harness's fixed ~1280px-wide window (the
 * module docstring's "FIVE COLUMNS" section) with nothing here to say so —
 * the strip would just start painting blank past its edge, exactly the
 * failure mode that section describes measuring directly.
 */
const STRIP_CONTENT_WIDTH_PX = DIE_SCENE_SIZE * FRAME_FRACTIONS.length + STRIP_GAP_PX * (FRAME_FRACTIONS.length - 1) + STRIP_PADDING_PX * 2;

const mounted: HTMLElement[] = [];
afterEach(async () => {
  while (mounted.length > 0) mounted.pop()!.remove();
  await page.viewport(414, 896);
});

describe("scene: the toss, frame by frame — the animation the visual suite always turns off", () => {
  it("a filmstrip across the 640ms toss, landing on the decided face with no last-moment correction", async () => {
    // The harness's own real, fixed browser-context ceiling — see the module
    // docstring's "ONE DIE" section. A content width past this paints blank,
    // not merely fuzzy, so this is a loud failure rather than a silently
    // wrong screenshot.
    expect(STRIP_CONTENT_WIDTH_PX, "the filmstrip no longer fits this harness's fixed ~1280px-wide window — see the module docstring's 'FIVE COLUMNS' section").toBeLessThan(1280);
    // Comfortably larger than `STRIP_CONTENT_WIDTH_PX` (five `DIE_SCENE_SIZE`
    // columns plus gaps and padding) so nothing paints as blank past this
    // viewport's own edge, and still small enough that Vitest never rescales
    // the whole test iframe to fit it inside the harness's real window.
    await page.viewport(STRIP_CONTENT_WIDTH_PX + 40, DIE_SCENE_SIZE + 90);
    ensureDiceStyles(document);
    ensureFilmstripOverride(document);

    const strip = document.createElement("div");
    // `hexdev-dice-root` first, so every `.hexdev-dice-…` rule this package
    // ships (theme tokens included) still applies exactly as it would on a
    // real board; `hexdev-dice-toss-strip` second, the marker the override
    // rule above is scoped to and nothing else reads.
    strip.className = `hexdev-dice-root ${FILMSTRIP_CLASS}`;
    // `inline-flex`, NOT `flex` — the exact reasoning `dice-styles.ts`'s own
    // `.hexdev-dice-root` rule already states for itself: a plain block
    // `flex` box's `width: auto` fills its CONTAINING BLOCK regardless of
    // content size, which measurably clipped this exact element to the
    // viewport's own width with every column past the first rendered but
    // uncounted. `inline-flex` sizes by shrink-to-fit instead, which —
    // because every column below is `flex-shrink: 0` and refuses to shrink —
    // resolves to this strip's true content width.
    strip.style.display = "inline-flex";
    // `.hexdev-dice-root` (the class just applied, above) ALSO carries its
    // own `flex-wrap: wrap` — correct for the cup-plus-tray it was written
    // for on a narrow phone viewport, wrong here: this strip must stay
    // exactly one row, or the five columns stack into five rows instead of
    // reading left to right as a filmstrip.
    strip.style.flexWrap = "nowrap";
    strip.style.alignItems = "flex-start";
    strip.style.gap = `${String(STRIP_GAP_PX)}px`;
    strip.style.background = "#14231d";
    strip.style.padding = `${String(STRIP_PADDING_PX)}px`;
    document.body.appendChild(strip);
    mounted.push(strip);

    const seeks: { cube: HTMLElement; freezeAtMs: number }[] = [];

    for (const fraction of FRAME_FRACTIONS) {
      const freezeAtMs = DICE_TOSS_DURATION_MS * fraction;

      const frame = document.createElement("figure");
      frame.style.margin = "0";
      frame.style.display = "flex";
      frame.style.flexDirection = "column";
      frame.style.alignItems = "center";
      frame.style.gap = "6px";
      // A flex CHILD of `strip`, which otherwise shrinks every column to fit
      // whatever width happens to be available — exactly the kind of
      // silent compression `visual-review.mjs`'s own geometry-blindness
      // story warns about, just caused by a browser default here instead of
      // a `pixelmatch` tolerance.
      frame.style.flexShrink = "0";

      const scene = createDieSceneElement(document, FACE, 0);
      // `.hexdev-dice-scene` is deliberately never RESIZED smaller here —
      // `dice-styles.ts`'s own comment on that class names the exact
      // clipping regression a box smaller than `DIE_SCENE_SIZE` reopens.
      frame.appendChild(scene);

      const cube = scene.querySelector<HTMLElement>(".hexdev-dice-cube");
      if (cube === null) throw new Error("createDieSceneElement did not produce a .hexdev-dice-cube");
      seeks.push({ cube, freezeAtMs });

      const caption = document.createElement("figcaption");
      caption.textContent = `${String(Math.round(fraction * 100))}% (${String(Math.round(freezeAtMs))}ms)`;
      caption.style.color = "#f4efe4";
      caption.style.font = "12px/1.4 system-ui, sans-serif";
      frame.appendChild(caption);

      strip.appendChild(frame);
    }

    // See `nextFrame`'s own comment — every cube above must actually have a
    // running `CSSAnimation` attached before the loop below can pause and
    // seek it.
    await nextFrame();
    await nextFrame();

    for (const { cube, freezeAtMs } of seeks) {
      const [animation] = cube.getAnimations();
      if (animation === undefined) throw new Error("expected a running hexdev-dice-toss animation on this cube");
      animation.pause();
      animation.currentTime = freezeAtMs;
      // The seek above is trustworthy — `getComputedStyle` reflects the
      // browser's own keyframe interpolation correctly, matrix-checked
      // against the module docstring's own worked example. What is NOT
      // trustworthy in this harness is relying on the still-attached,
      // still-paused animation to PAINT that value: measured directly (see
      // the module docstring's "HOW A SINGLE FRAME…" section), it does not.
      // Capturing the correct matrix and then cancelling the animation
      // before writing that matrix back as a plain inline `transform` routes
      // this frame through the same ordinary, non-animated paint path every
      // resting die already uses correctly.
      const frozenTransform = window.getComputedStyle(cube).transform;
      animation.cancel();
      cube.style.transform = frozenTransform;
    }

    // One more rendering opportunity before the capture, so the inline
    // `transform` write above has actually been painted.
    await nextFrame();

    await expect.element(strip).toMatchScreenshot("dice-toss-filmstrip");
  });
});
