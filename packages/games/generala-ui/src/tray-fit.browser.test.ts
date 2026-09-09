import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { buildDiceStylesheet, createDieSceneElement, ensureDiceStyles } from "@hexdev/dice-ui";
import { applyRoll, createMatch, getLegalActions, getViewFor } from "@hexdev/generala-engine";
import type { ApplyResult, MatchState, PlayerId } from "@hexdev/generala-engine";

import { BOARD_CLASS, ensureBoardStyles } from "./board-styles.js";
import { createGeneralaTray } from "./tray.js";
import { buildTrayStylesheet, ensureTrayStyles, TRAY_STYLE_ID } from "./tray-styles.js";

/**
 * THE TRAY MEASURES THE BOX IT IS IN, NOT THE WINDOW IT IS ON.
 *
 * MEASURED, at a 1280px viewport with the tray in a 600px box: five dice at
 * their unscaled size take **three rows and 638px of height**, because the
 * only ladder above them reads the VIEWPORT and the viewport says there is
 * plenty of room. That is not a hypothetical mounting — it is the board this
 * game is heading for, a tray beside a planilla on a desktop window, and it
 * is exactly the case a width `@media` cannot see.
 *
 * SO EVERY WIDTH BELOW IS A CONTAINER WIDTH, AND THE VIEWPORT IS PINNED WIDE
 * for all of them. At 1550px no width `@media` in the repository can match, so
 * anything that changes across these cases changed because of the tray's own
 * box. That pinning is the whole design of this file: it is what makes the
 * assertions unable to pass against a viewport ladder.
 */

const SEAT = "seat-0" as PlayerId;
const RIVAL = "seat-1" as PlayerId;
const SEATS: readonly PlayerId[] = [SEAT, RIVAL];

/** Wide enough that no width `@media` this repository ships can match. */
const WIDE_VIEWPORT = 1550;

/**
 * THE LADDER, PINNED, ON THE CONTAINER AXIS — the same widths
 * `dice-tray-fit.browser.test.ts` sweeps on the viewport axis and the same two
 * scales `dice-styles.ts` ships, because this is ONE decision read on two
 * axes rather than two ladders that happen to share numbers.
 *
 * The scales are hand-written here for the reason that file gives: reading
 * them back out of the stylesheet would make this test agree with any ladder
 * at all, which is the opposite of a pin.
 */
const LADDER: readonly { readonly width: number; readonly scale: number }[] = [
  { width: 320, scale: 0.45 },
  { width: 375, scale: 0.45 },
  { width: 700, scale: 0.6 },
  { width: 960, scale: 1 },
  { width: 1280, scale: 1 },
  { width: 1550, scale: 1 },
];

const mounted: HTMLElement[] = [];
afterEach(async () => {
  while (mounted.length > 0) mounted.pop()!.remove();
  document.getElementById(TRAY_STYLE_ID)?.remove();
  await page.viewport(414, 896);
});

function accept(result: ApplyResult): MatchState {
  if (!result.ok) throw new Error(`the engine refused a step this test depends on: ${result.violation.code}`);
  return result.state;
}

/** A real tray, rolled, inside a box of exactly `width` — the shape a board
 * gives it when the planilla is sitting beside it. */
function trayInBox(width: number): { readonly diceEl: HTMLElement; readonly boxes: () => readonly HTMLElement[] } {
  const box = document.createElement("div");
  box.style.width = `${String(width)}px`;
  const diceEl = document.createElement("div");
  const rollEl = document.createElement("div");
  box.append(diceEl, rollEl);
  document.body.appendChild(box);
  mounted.push(box);

  const state = accept(applyRoll(createMatch(SEATS), [3, 5, 5, 2, 6]));
  createGeneralaTray()({ diceEl, rollEl }, getViewFor(state, SEAT), getLegalActions(state, SEAT), () => {});

  return { diceEl, boxes: () => [...diceEl.querySelectorAll<HTMLElement>(".hexdev-dice-scene-box")] };
}

describe("generala tray: the dice are sized by the tray's own box, at the pinned ladder", () => {
  it.each(LADDER)("in a $width px box, on a 1550px window, every die measures the unscaled tier times $scale", async ({ width, scale }) => {
    await page.viewport(WIDE_VIEWPORT, 900);

    // The unscaled reference is MEASURED, not a literal: `DIE_SCENE_SIZE` is
    // `dice-ui`'s own geometry and is fenced there, and re-typing it here
    // would copy an unfenced number into a second package.
    const reference = trayInBox(WIDE_VIEWPORT).boxes()[0]!.getBoundingClientRect().width;
    expect(reference).toBeGreaterThan(0);

    for (const die of trayInBox(width).boxes()) {
      expect(die.getBoundingClientRect().width).toBeCloseTo(reference * scale, 1);
    }
  });

  it.each(LADDER)("in a $width px box, on a 1550px window, no die is drawn outside the tray", async ({ width }) => {
    await page.viewport(WIDE_VIEWPORT, 900);
    const tray = trayInBox(width);

    const row = tray.diceEl.getBoundingClientRect();
    for (const die of tray.boxes()) {
      const rect = die.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(row.left - 0.5);
      expect(rect.right).toBeLessThanOrEqual(row.right + 0.5);
    }
    // The tray wraps, so "fits" is never a claim about ONE row — it is the
    // claim that nothing ends up outside the box the board gave it, which a
    // clipped tray would show as a scroll width past its own client width.
    expect(tray.diceEl.scrollWidth).toBeLessThanOrEqual(tray.diceEl.clientWidth);
  });

  it("shrinks the tray in a narrow box even though the window is wide, which the viewport ladder cannot do", async () => {
    // The defect, stated as a measurement: at 1280px the viewport ladder is at
    // its unscaled tier, so a 600px board used to get five full-size dice and
    // a tray three rows deep.
    await page.viewport(1280, 900);
    const narrow = trayInBox(600);
    const wide = trayInBox(1280);

    const rowsIn = (tray: { readonly boxes: () => readonly HTMLElement[] }): number => new Set(tray.boxes().map((die) => Math.round(die.getBoundingClientRect().top))).size;

    expect(narrow.boxes()[0]!.getBoundingClientRect().width).toBeLessThan(wide.boxes()[0]!.getBoundingClientRect().width);
    expect(rowsIn(narrow)).toBeLessThan(3);
  });
});

describe("generala tray: one responsive decision, read on the axis each package can actually measure", () => {
  it("switches shape on a CONTAINER query and never on the viewport", () => {
    // The same assertion `escoba-ui`'s `rail.browser.test.ts` makes of its own
    // stylesheet, and this package is now the third to make it. The `@media`
    // that survives is `prefers-reduced-motion`, which is not a width.
    const css = buildTrayStylesheet();

    expect(css).toContain("@container hexdev-generala-tray");
    expect(css).not.toMatch(/@media[^{]*width/);
  });

  it("establishes the container it queries, in the one element it always owns", () => {
    ensureTrayStyles(document);
    const tray = document.createElement("div");
    tray.className = "hexdev-generala-tray";
    document.body.appendChild(tray);
    mounted.push(tray);

    expect(getComputedStyle(tray).containerName).toBe("hexdev-generala-tray");
    expect(getComputedStyle(tray).containerType).toBe("inline-size");
  });

  it("leaves a die mounted OUTSIDE any tray on dice-ui's own viewport ladder", async () => {
    // WHY `dice-ui` KEEPS ITS WIDTH `@media`, measured rather than asserted:
    // a `@container` query with no ancestor container does not match at all —
    // a probe styled only inside one stayed at its unqueried width — so
    // moving that package's ladder onto the container axis would silently
    // unscale every consumer that establishes no container, starting with its
    // own cup and its scene gallery. And it cannot establish one itself: the
    // only element it always owns above a die is `.hexdev-dice-root`, whose
    // `inline-flex` shrink-wrap MEASURED 1218px before `container-type` and
    // 24px after.
    await page.viewport(320, 900);
    ensureDiceStyles(document);
    const host = document.createElement("div");
    document.body.appendChild(host);
    mounted.push(host);
    host.appendChild(createDieSceneElement(document, 4, 0));

    expect(buildDiceStylesheet()).toMatch(/@media[^{]*max-width/);
    const bare = host.querySelector<HTMLElement>(".hexdev-dice-scene-box")!;
    const scaled = bare.getBoundingClientRect().width;

    await page.viewport(WIDE_VIEWPORT, 900);
    expect(bare.getBoundingClientRect().width).toBeGreaterThan(scaled);
  });
});

/**
 * A REAL ROLL ROW — the board's own class and its own stylesheet, not the
 * bare `<div>` `trayInBox` above hands the tray. The row is the board's
 * geometry (`board-styles.ts`: the tray owns the button and the cup, the
 * board owns where they go), so measuring it through an unstyled div would
 * measure nothing that ships.
 */
function rollRowInBox(width: number, state: MatchState): { readonly rollEl: HTMLElement; readonly diceEl: HTMLElement; readonly cup: HTMLElement } {
  ensureBoardStyles(document);
  const box = document.createElement("div");
  box.style.width = `${String(width)}px`;
  const diceEl = document.createElement("div");
  const rollEl = document.createElement("div");
  rollEl.className = `${BOARD_CLASS}-roll`;
  box.append(diceEl, rollEl);
  document.body.appendChild(box);
  mounted.push(box);

  createGeneralaTray()({ diceEl, rollEl }, getViewFor(state, SEAT), getLegalActions(state, SEAT), () => {});
  const cup = rollEl.querySelector<HTMLElement>(".hexdev-dice-cup-piece");
  if (cup === null) throw new Error("expected a cubilete in the roll row");
  return { rollEl, diceEl, cup };
}

/** The narrowest box in the pinned ladder above, which is the narrowest phone
 * this product draws a tray on at all. */
const NARROWEST = LADDER[0]!.width;

describe("generala tray: the cubilete and the control that commits share one row", () => {
  it.each(LADDER)("in a $width px box nothing in the pair is painted outside the row", async ({ width }) => {
    await page.viewport(WIDE_VIEWPORT, 900);
    const rolled = accept(applyRoll(createMatch(SEATS), [3, 5, 5, 2, 6]));
    const { rollEl } = rollRowInBox(width, rolled);

    // MEASURED ON THE PAINTED BOX, which is not the laid-out one: the
    // cubilete rests at `rotate(9deg)`, so its `getBoundingClientRect` is
    // 145px wide where its layout box is 124. At the narrowest tier that
    // leaves under two pixels of clearance on the left — real, and exactly
    // the kind of thing a `scrollWidth` check alone would never report,
    // since a rotation spills paint without moving layout.
    const row = rollEl.getBoundingClientRect();
    for (const child of [...rollEl.children]) {
      const rect = child.getBoundingClientRect();
      expect(rect.left, `${String(width)}px box`).toBeGreaterThanOrEqual(row.left - 0.5);
      expect(rect.right, `${String(width)}px box`).toBeLessThanOrEqual(row.right + 0.5);
    }
  });

  /**
   * THE CONTROL IS NOT SQUEEZED BY THE THING THAT MOVED IN NEXT TO IT, and
   * this assertion had to be rewritten to say that.
   *
   * The first version asserted `rollEl.scrollWidth <= clientWidth` and called
   * it "the pair fits on one line". It was green — and MEASURED to be green
   * for the wrong reason: a flex child does not overflow, it SHRINKS, so the
   * button was quietly wrapping its label into a second line and reporting no
   * overflow at all. The same assertion would have stayed green with the
   * control crushed into a column of stacked letters. That is
   * `AGENTS.md`'s "una valla que mide el mecanismo equivocado", found by
   * probing the numbers instead of trusting the green.
   *
   * Height is the honest instrument: one line or two is exactly what a wrap
   * changes, and nothing else here changes it.
   */
  it(`keeps the throw label on one line at ${String(NARROWEST)}px, the label every real throw carries`, async () => {
    await page.viewport(WIDE_VIEWPORT, 900);
    const rolled = accept(applyRoll(createMatch(SEATS), [3, 5, 5, 2, 6]));
    const wide = rollRowInBox(960, rolled).rollEl.querySelector<HTMLElement>(".hexdev-generala-roll")!;
    const narrow = rollRowInBox(NARROWEST, rolled).rollEl.querySelector<HTMLElement>(".hexdev-generala-roll")!;

    expect(narrow.textContent).toBe(wide.textContent);
    expect(narrow.getBoundingClientRect().height).toBe(wide.getBoundingClientRect().height);
  });

  /**
   * THE ONE LABEL THAT DOES WRAP, BOUNDED RATHER THAN DENIED.
   *
   * `KEEPING_ALL_FIVE` ("Guardar los cinco no es una tirada") is far longer
   * than the throw label, and MEASURED: with the cubilete beside it, it goes
   * to two lines below about 450px of board. That is a real cost of this
   * change and it is accepted rather than hidden — it is the DISABLED state
   * of a control, shown while a player has every die marked, and a two-line
   * sentence explaining why nothing will happen is a reasonable shape for a
   * sentence. What must not happen is the next step down: a control ground
   * into three or four lines because something beside it grew.
   */
  it(`lets the refusal label reach two lines at ${String(NARROWEST)}px, and no further`, async () => {
    await page.viewport(WIDE_VIEWPORT, 900);
    const rolled = accept(applyRoll(createMatch(SEATS), [3, 5, 5, 2, 6]));
    const { rollEl, diceEl } = rollRowInBox(NARROWEST, rolled);
    const oneLine = rollEl.querySelector<HTMLElement>(".hexdev-generala-roll")!.getBoundingClientRect().height;

    for (const die of diceEl.querySelectorAll<HTMLButtonElement>(".hexdev-generala-die")) die.click();
    const refusing = rollEl.querySelector<HTMLButtonElement>(".hexdev-generala-roll");
    expect(refusing, "expected the control to still be rendered while all five are held").not.toBeNull();
    expect(refusing!.textContent!.length, "expected the long refusal label, not a short one").toBeGreaterThan(20);

    const lineHeight = oneLine;
    expect(refusing!.getBoundingClientRect().height).toBeLessThanOrEqual(lineHeight * 2);
  });

  /**
   * THE CONTROL IS NOT STRETCHED TO THE CUBILETE'S HEIGHT, which is what a
   * flex row does by default and what `board-styles.ts` now spends a
   * paragraph refusing. It was an UNFENCED claim in that comment until a
   * mutation ladder deleted `align-items: center` and every test stayed
   * green: a 40px button silently becomes a 146px column of felt with a word
   * floating in the middle of it, and nothing in this repository could see
   * it. Reading the two heights back off the real row is what can.
   */
  it("leaves the throw control at its own content height rather than stretching it to the cubilete's", async () => {
    await page.viewport(WIDE_VIEWPORT, 900);
    const rolled = accept(applyRoll(createMatch(SEATS), [3, 5, 5, 2, 6]));
    const { rollEl, cup } = rollRowInBox(600, rolled);
    const button = rollEl.querySelector<HTMLElement>(".hexdev-generala-roll")!;

    // The cubilete's own painted height is the ceiling `stretch` would drag
    // the button up to; a control that is a THIRD of it is plainly still
    // sized by its own text.
    const cupHeight = cup.getBoundingClientRect().height;
    expect(cupHeight).toBeGreaterThan(100);
    expect(button.getBoundingClientRect().height).toBeLessThan(cupHeight / 2);
  });

  /**
   * THE GESTURE SWINGS OUTSIDE THE CUP'S OWN BOX and must not swing outside
   * the BOARD. `dice-styles.ts`'s pivot comment argues that turning about the
   * drawn cubilete's own middle — rather than about its base, like a cup
   * toppling — is what keeps the swing contained; this is the measurement of
   * that claim on the element as the board actually lays it out, at the
   * hardest instant of the hardest gesture.
   *
   * The transform is applied directly rather than by waiting out an
   * animation: the point is the geometry of the pose, and a test that slept
   * through 100ms of a real tip would measure the same rectangle less
   * reliably.
   */
  it("keeps every instant of the tip inside the board's own row", async () => {
    await page.viewport(WIDE_VIEWPORT, 900);
    const rolled = accept(applyRoll(createMatch(SEATS), [3, 5, 5, 2, 6]));
    const { rollEl, cup } = rollRowInBox(NARROWEST, rolled);
    const row = rollEl.getBoundingClientRect();

    const stops = [...buildDiceStylesheet().matchAll(/@keyframes hexdev-dice-cup-tip\s*\{([\s\S]*?)\n\}/g)]
      .flatMap((block) => [...block[1]!.matchAll(/transform:\s*([^;]+);/g)])
      .map((m) => m[1]!.trim());
    expect(stops.length, "expected the tip's keyframe stops to be readable").toBeGreaterThan(2);

    for (const transform of stops) {
      cup.style.transform = transform;
      const rect = cup.getBoundingClientRect();
      expect(rect.left, transform).toBeGreaterThanOrEqual(row.left - 0.5);
      expect(rect.right, transform).toBeLessThanOrEqual(row.right + 0.5);
    }
  });
});
