import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { applyRoll, createMatch, getLegalActions, getViewFor } from "@hexdev/generala-engine";
import type { ApplyResult, MatchState, PlayerId } from "@hexdev/generala-engine";

import { createGeneralaTray } from "./tray.js";
import { TRAY_STYLE_ID } from "./tray-styles.js";

/**
 * THE RING GOES AROUND THE DIE, NOT AROUND THE ROOM THE DIE FLIES THROUGH.
 *
 * FOUND BY LOOKING, twice: slice 13's review recorded a gold ring measuring
 * 214px around a 110px die — about 45px of felt between the two on every
 * side, so it read as a plate the die was sitting on rather than as a ring
 * around it — and slice 15's review saw the same thing at every tier of the
 * responsive ladder, because the ratio is fixed.
 *
 * The cause is not a mistake anywhere: `.hexdev-dice-scene-box` is sized for
 * the FLIGHT (`DIE_SCENE_SIZE` is the smallest box that keeps every instant
 * of a tumbling die inside it), and a die at REST is much smaller than the
 * room it needs mid-toss. A cue drawn on that box is therefore drawn around
 * the flight envelope.
 *
 * WHAT MAKES THIS FIXABLE NOW, when slice 13 correctly said it was not: the
 * resting footprint is `dice-ui`'s geometry, and it now PUBLISHES it as
 * `--dice-rest-size`. This package reads that property and copies no number.
 */

const SEAT = "seat-0" as PlayerId;
const RIVAL = "seat-1" as PlayerId;
const SEATS: readonly PlayerId[] = [SEAT, RIVAL];

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

function heldTray(width: number): { readonly buttons: readonly HTMLButtonElement[] } {
  const box = document.createElement("div");
  box.style.width = `${String(width)}px`;
  const diceEl = document.createElement("div");
  const rollEl = document.createElement("div");
  box.append(diceEl, rollEl);
  document.body.appendChild(box);
  mounted.push(box);

  const state = accept(applyRoll(createMatch(SEATS), [3, 5, 5, 2, 6]));
  createGeneralaTray()({ diceEl, rollEl }, getViewFor(state, SEAT), getLegalActions(state, SEAT), () => {});

  const buttons = [...diceEl.querySelectorAll<HTMLButtonElement>(".hexdev-generala-die")];
  buttons[1]?.click();
  return { buttons };
}

/** The element the ring is drawn on: `dice-ui`'s own sized box, which is
 * where `--dice-rest-size` is declared and therefore the only place a rule
 * can read it. */
function sceneBox(button: HTMLButtonElement): HTMLElement {
  const box = button.querySelector<HTMLElement>(".hexdev-dice-scene-box");
  if (box === null) throw new Error("expected a dice-ui scene box inside the control");
  return box;
}

/** The ring's painted box. It is a pseudo-element, so it is measured the only
 * way a pseudo-element can be: by asking the browser what it computed. */
function ringInset(box: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(box, "::after").insetBlockStart);
}

describe("generala tray: the held cue is drawn around the die, at every tier of the ladder", () => {
  /** What `dice-ui` says a resting die is painted at, in this box, at this
   * tier. Read the only way CSS lets a test read a `calc()` custom property:
   * by giving a real element that width and measuring it. */
  function restSizeIn(box: HTMLElement): number {
    const probe = document.createElement("div");
    probe.style.width = "var(--dice-rest-size)";
    box.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  }

  it.each([
    { width: 1550, tier: "unscaled" },
    { width: 700, tier: "0.6" },
    { width: 375, tier: "0.45" },
  ])("in a $width px tray ($tier) the ring hugs the RESTING die, not the flight box", async ({ width }) => {
    await page.viewport(1550, 900);
    const { buttons } = heldTray(width);
    const held = buttons[1]!;
    expect(held.getAttribute("aria-pressed")).toBe("true");

    const boxEl = sceneBox(held);
    // THE ONE CLAIM HERE THAT IS ABOUT MECHANISM RATHER THAN ABOUT PIXELS,
    // and it is stated because it cannot be anything else: a pseudo-element
    // has no node, so its PAINTED box cannot be measured — `getComputedStyle`
    // hands back the geometry it was declared with, resolved against the
    // element it belongs to, whatever containing block it would really land
    // in. That containing block is what this declaration is; without it the
    // ring is positioned against whatever is positioned further up the page,
    // and every number below still reads exactly the same.
    expect(getComputedStyle(boxEl).position, "the ring's containing block").toBe("relative");
    const box = boxEl.getBoundingClientRect().width;
    const rest = restSizeIn(boxEl);
    const ring = box - 2 * ringInset(boxEl);

    // THE FLIGHT BOX IS MUCH BIGGER THAN THE DIE IN IT, which is the whole
    // reason a cue drawn on it looked like a plate. Stated as a measurement
    // so the premise of this fix cannot quietly stop being true.
    expect(rest).toBeGreaterThan(0);
    expect(rest).toBeLessThan(box * 0.7);

    // AND THE RING IS THE DIE PLUS THIS PACKAGE'S OWN AIR, exactly. The 6 is
    // `--generala-held-air`, which this file owns; every number on the
    // `dice-ui` side of the sum arrives through the property.
    expect(ring).toBeCloseTo(rest + 12, 1);
  });

  it("draws no ring at all on a die nobody is keeping", async () => {
    await page.viewport(1550, 900);
    const { buttons } = heldTray(1550);
    const loose = buttons[0]!;

    expect(loose.getAttribute("aria-pressed")).toBe("false");
    expect(getComputedStyle(sceneBox(loose), "::after").content).toBe("none");
  });

  it("keeps every die in the row exactly the same size whether it is held or not", async () => {
    // The ring is out of flow, so pressing a die cannot resize it and the row
    // cannot step sideways under the finger that pressed it. This is the
    // claim slice 13 reserved a transparent border for; the border is gone
    // and the claim is not.
    await page.viewport(1550, 900);
    const { buttons } = heldTray(1550);

    const widths = buttons.map((button) => button.getBoundingClientRect().width);
    expect(new Set(widths.map((width) => Math.round(width))).size).toBe(1);
  });
});
