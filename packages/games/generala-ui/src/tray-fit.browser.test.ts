import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { buildDiceStylesheet, createDieSceneElement, ensureDiceStyles } from "@hexdev/dice-ui";
import { applyRoll, createMatch, getLegalActions, getViewFor } from "@hexdev/generala-engine";
import type { ApplyResult, MatchState, PlayerId } from "@hexdev/generala-engine";

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
  createGeneralaTray()({ diceEl, rollEl }, getViewFor(state, SEAT).turn, getLegalActions(state, SEAT), () => {});

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
