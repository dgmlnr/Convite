/// <reference types="@vitest/browser/matchers" />
import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { CUP_PIECE_HEIGHT, CUP_PIECE_WIDTH, CUP_SHAKE_CYCLE_MS, CUP_TIP_DURATION_MS, ensureDiceStyles } from "./dice-styles.js";
import { createCupElement, setCupGesture } from "./cup.js";
import type { CupGesture } from "./cup.js";

/**
 * THE GESTURE NOBODY HAS EVER SEEN — the cup's half of the problem
 * `dice-toss-filmstrip.scene.test.ts` solved for the dice, using that file's
 * own technique whole.
 *
 * The short version of it, because it is not obvious and it was arrived at
 * after two dead ends that file documents at length: `visual/setup.ts`
 * disables every animation on the page globally, so no scene can photograph
 * one playing. The way through is to seek the browser's OWN animation to an
 * instant with the Web Animations API, read the interpolated transform back
 * off `getComputedStyle`, CANCEL the animation, and write that transform on
 * as a plain static inline style — because a seeked-but-still-attached
 * animation reads back correctly and does not repaint inside this harness's
 * nested iframe. Nothing about `CUP_SHAKE_CYCLE_MS` or `CUP_TIP_DURATION_MS`
 * is reimplemented here; every frame is the browser interpolating the exact
 * keyframes `dice-styles.ts` ships.
 *
 * TWO STRIPS, ONE IMAGE, because the two gestures answer different questions
 * and a reviewer should not have to hold one in memory while looking at the
 * other. The shake's question is "is this a cubilete being worked, or a
 * picture vibrating" — so it is sampled across ONE cycle, which is all there
 * is: the animation loops, so cycle two is cycle one. The tip's question is
 * the product owner's own, in his words: does the cup incline while the dice
 * are coming out. That one is sampled across the whole tip, and the two
 * checkpoints that matter are called out in the captions — the instant the
 * mouth is down, and the instant it starts coming back up, which is the
 * window every die leaves through.
 *
 * WHY THE DICE ARE NOT IN THIS PICTURE. They have their own filmstrip and it
 * already answers its own question. What cannot be photographed at all is the
 * two of them TOGETHER over time: a still frame of a tipping cup beside five
 * tumbling dice would show one instant of a relationship whose whole content
 * is the timing. The arithmetic of that relationship is fenced instead, in
 * `dice-styles.test.ts` — the cup is over before the first die leaves and
 * still over after the last one does — which is the part a picture would not
 * have proved anyway.
 *
 * NOT A REGRESSION FENCE, like every `*.scene.test.ts` here: rendered by
 * `pnpm visual:review` with `--update`, compared against nothing, gitignored,
 * and existing purely for a person to open and judge.
 */

const FILMSTRIP_CLASS = "hexdev-dice-cup-strip";
const FILMSTRIP_OVERRIDE_ID = "hexdev-dice-cup-strip-override";

/**
 * The one rule this scene needs. A single class selector already outranks
 * `visual/setup.ts`'s universal `*, *::before, *::after` reset, so an
 * `!important` at this specificity wins here and — because nothing else in
 * the repository ever carries this class — cannot reach any other scene,
 * baseline or die. The declarations are `dice-styles.ts`'s own, restated
 * scoped rather than reinvented.
 */
function ensureFilmstripOverride(doc: Document): void {
  if (doc.getElementById(FILMSTRIP_OVERRIDE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = FILMSTRIP_OVERRIDE_ID;
  style.textContent = `
    .${FILMSTRIP_CLASS} .hexdev-dice-cup-piece[data-cup-gesture="shaking"] {
      animation: hexdev-dice-cup-shake ${String(CUP_SHAKE_CYCLE_MS)}ms ease-in-out infinite !important;
    }
    .${FILMSTRIP_CLASS} .hexdev-dice-cup-piece[data-cup-gesture="tipping"] {
      animation: hexdev-dice-cup-tip ${String(CUP_TIP_DURATION_MS)}ms ease-out !important;
    }
  `;
  doc.head.appendChild(style);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

const SHAKE_FRACTIONS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];
/** The tip's own two named checkpoints are in here on purpose — 18% is the
 * mouth all the way down and 45% is the cup starting back up, which are the
 * two edges of the window the dice leave through. */
const TIP_FRACTIONS: readonly number[] = [0, 0.18, 0.32, 0.45, 0.7, 1];

const STRIP_GAP_PX = 10;
const STRIP_PADDING_PX = 16;
const COLUMN_WIDTH_PX = CUP_PIECE_WIDTH + 46;
/**
 * Computed rather than hand-copied, the same reasoning the toss filmstrip
 * states for its own: past the harness's fixed ~1280px browser-context
 * window, content does not merely shrink — it paints blank white, silently.
 * A future bump to `CUP_PIECE_WIDTH` or to either fraction list must trip the
 * assertion below instead of producing a half-empty screenshot.
 */
const widestRow = Math.max(SHAKE_FRACTIONS.length, TIP_FRACTIONS.length);
const STRIP_CONTENT_WIDTH_PX = COLUMN_WIDTH_PX * widestRow + STRIP_GAP_PX * (widestRow - 1) + STRIP_PADDING_PX * 2;

const mounted: HTMLElement[] = [];
afterEach(async () => {
  while (mounted.length > 0) mounted.pop()!.remove();
  await page.viewport(414, 896);
});

interface Seek {
  readonly cup: HTMLElement;
  readonly freezeAtMs: number;
}

function buildRow(doc: Document, gesture: Exclude<CupGesture, "still">, fractions: readonly number[], durationMs: number, seeks: Seek[]): HTMLElement {
  const row = doc.createElement("div");
  row.style.display = "flex";
  row.style.gap = `${String(STRIP_GAP_PX)}px`;
  row.style.alignItems = "flex-end";

  for (const fraction of fractions) {
    const freezeAtMs = durationMs * fraction;
    const frame = doc.createElement("figure");
    frame.style.margin = "0";
    frame.style.display = "flex";
    frame.style.flexDirection = "column";
    frame.style.alignItems = "center";
    frame.style.gap = "6px";
    // A flex child of a row that would otherwise compress every column to
    // whatever width happens to be left — the same silent squeeze the toss
    // filmstrip names.
    frame.style.flexShrink = "0";
    frame.style.width = `${String(COLUMN_WIDTH_PX)}px`;

    // The gesture swings the cup outside its own box on purpose (that is what
    // a tip IS), so each column reserves the piece's full height plus room
    // for the swing and lets the cup sit at the bottom of it, the way it sits
    // on a table.
    const stage = doc.createElement("div");
    stage.style.height = `${String(CUP_PIECE_HEIGHT + 40)}px`;
    stage.style.display = "flex";
    stage.style.alignItems = "flex-end";
    stage.style.justifyContent = "center";

    const cup = createCupElement(doc);
    setCupGesture(cup, gesture);
    stage.appendChild(cup);
    frame.appendChild(stage);
    seeks.push({ cup, freezeAtMs });

    const caption = doc.createElement("figcaption");
    caption.textContent = `${String(Math.round(fraction * 100))}% (${String(Math.round(freezeAtMs))}ms)`;
    caption.style.color = "#f4efe4";
    caption.style.font = "12px/1.4 system-ui, sans-serif";
    frame.appendChild(caption);

    row.appendChild(frame);
  }
  return row;
}

function label(doc: Document, text: string): HTMLElement {
  const heading = doc.createElement("div");
  heading.textContent = text;
  heading.style.color = "#e8c877";
  heading.style.font = "600 13px/1.6 system-ui, sans-serif";
  return heading;
}

describe("scene: the cubilete, frame by frame — the shake and the tip the visual suite always turns off", () => {
  it("one cycle of the shake and one whole tip, both read off the browser's own interpolation", async () => {
    // The harness's real, fixed browser-context ceiling. Past it a frame
    // paints blank rather than fuzzy, so this is a loud failure instead of a
    // quietly wrong screenshot.
    expect(STRIP_CONTENT_WIDTH_PX, "the cup filmstrip no longer fits this harness's fixed ~1280px window").toBeLessThan(1280);
    await page.viewport(STRIP_CONTENT_WIDTH_PX + 40, (CUP_PIECE_HEIGHT + 40) * 2 + 150);
    ensureDiceStyles(document);
    ensureFilmstripOverride(document);

    const strip = document.createElement("div");
    // `hexdev-dice-root` first so every `--dice-…` token this package ships
    // applies exactly as it would on a real board; the strip marker second,
    // and nothing but the override rule above ever reads it.
    strip.className = `hexdev-dice-root ${FILMSTRIP_CLASS}`;
    strip.style.display = "inline-flex";
    strip.style.flexDirection = "column";
    // `.hexdev-dice-root` carries `flex-wrap: wrap`, correct for the cup-and-
    // tray group it was written for and wrong here: a wrapped row stops being
    // a filmstrip.
    strip.style.flexWrap = "nowrap";
    strip.style.alignItems = "flex-start";
    strip.style.gap = "10px";
    strip.style.background = "#14231d";
    strip.style.padding = `${String(STRIP_PADDING_PX)}px`;
    document.body.appendChild(strip);
    mounted.push(strip);

    const seeks: Seek[] = [];
    strip.append(
      label(document, "AGITANDO — un ciclo, en bucle mientras la mesa espera el tiro"),
      buildRow(document, "shaking", SHAKE_FRACTIONS, CUP_SHAKE_CYCLE_MS, seeks),
      label(document, "VOLCANDO — 18% la boca ya está abajo, 45% empieza a volver: los cinco dados salen entre esas dos"),
      buildRow(document, "tipping", TIP_FRACTIONS, CUP_TIP_DURATION_MS, seeks),
    );

    // Every cup above must actually have a running CSSAnimation attached
    // before anything tries to seek one.
    await nextFrame();
    await nextFrame();

    for (const { cup, freezeAtMs } of seeks) {
      const [animation] = cup.getAnimations();
      if (animation === undefined) throw new Error("expected a running cup gesture on this cubilete");
      animation.pause();
      animation.currentTime = freezeAtMs;
      // Seek, read, cancel, write back as a plain inline transform — see the
      // module docstring, and `dice-toss-filmstrip.scene.test.ts` for the two
      // techniques that measurably did not work.
      const frozen = window.getComputedStyle(cup).transform;
      animation.cancel();
      cup.style.transform = frozen;
    }

    await nextFrame();

    await expect.element(strip).toMatchScreenshot("dice-cup-gesture-filmstrip");
  });
});
