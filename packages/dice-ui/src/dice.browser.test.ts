import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DieFace } from "./geometry.js";
import { createDiceCup } from "./dice.js";

const ROLL: readonly DieFace[] = [3, 5, 5, 2, 6];
/** The breakpoints this repository already standardizes on for a geometry
 * fence — the same set `table-viewport-fit.browser.test.ts` and siblings
 * sweep, reused rather than invented. */
const BREAKPOINTS = [320, 375, 700, 960, 1280, 1550] as const;

const mounted: HTMLElement[] = [];
afterEach(async () => {
  while (mounted.length > 0) mounted.pop()!.remove();
  await page.viewport(414, 896);
});

function mountCup(onPress: () => void = () => {}) {
  const handle = createDiceCup(document, { onPress });
  document.body.appendChild(handle.element);
  mounted.push(handle.element);
  return handle;
}

describe("dice: pressing the cup asks, it never decides", () => {
  it("calls onPress exactly once per click, and rolls nothing on its own", () => {
    const onPress = vi.fn();
    const handle = mountCup(onPress);
    handle.cupElement.click();
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(handle.trayElement.children.length).toBe(0);
  });
});

describe("dice: a roll renders every die already posed at its decided face", () => {
  it("mounts one die scene per face, in order", () => {
    const handle = mountCup();
    handle.roll(ROLL);
    const scenes = [...handle.trayElement.querySelectorAll(".hexdev-dice-scene")];
    expect(scenes.length).toBe(ROLL.length);
  });

  it("replaces the whole tray on a second roll rather than accumulating dice", () => {
    const handle = mountCup();
    handle.roll(ROLL);
    handle.roll([1, 1, 1]);
    expect(handle.trayElement.querySelectorAll(".hexdev-dice-scene").length).toBe(3);
  });

  /**
   * THE ANNOUNCEMENT, IN THE SAME SYNCHRONOUS CALL AS THE ROLL — no
   * animation frame awaited, mirroring `die.browser.test.ts`'s write-order
   * proof one level up: a screen-reader user learns "Tirada: 3, 5, 5, 2, 6"
   * the instant `roll()` returns, not ~640ms later when the toss finishes.
   */
  it("announces the plain-language result the instant roll() returns", () => {
    const handle = mountCup();
    handle.roll(ROLL);
    expect(handle.announcerElement.textContent).toBe("Tirada: 3, 5, 5, 2, 6");
  });

  it("does not re-announce an identical result, so a reader is not told the same sentence twice", () => {
    const handle = mountCup();
    handle.roll(ROLL);
    const before = handle.announcerElement.textContent;
    handle.roll(ROLL);
    expect(handle.announcerElement.textContent).toBe(before);
  });
});

describe("dice: the cup's real, laid-out tap target meets the 44px floor at every breakpoint", () => {
  it.each(BREAKPOINTS)("at %spx wide, the cup is at least 44x44 in real layout, not merely in its own stylesheet", async (width) => {
    await page.viewport(width, 900);
    const handle = mountCup();
    const rect = handle.cupElement.getBoundingClientRect();
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
  });
});

describe("dice: the tray wraps five dice on a narrow phone rather than overflowing or shrinking them illegibly", () => {
  /**
   * WAS 960px, before `.hexdev-dice-scene` grew from 110px to `DIE_SCENE_SIZE`
   * (`dice-styles.ts`'s own header explains why a rotating cube needs a
   * bigger box than a resting one). Five scenes at the new size plus the
   * tray's own gaps no longer fit inside 960px at all — this test would fail
   * saying dice wrapped where it expected one row, not because five dice
   * stopped fitting on wide screens, but because "wide enough" moved out
   * past 960px along with the box that grew. 1550 is not a new number
   * invented for this fix; it is the widest entry `BREAKPOINTS` above
   * already standardizes on, reused rather than a fresh literal.
   */
  it("puts every die on one row once the container is wide enough", async () => {
    await page.viewport(1550, 700);
    const handle = mountCup();
    handle.roll(ROLL);
    const tops = [...handle.trayElement.querySelectorAll(".hexdev-dice-scene")].map((el) => el.getBoundingClientRect().top);
    expect(new Set(tops).size).toBe(1);
  });

  it("wraps onto more than one row at the narrowest standardized breakpoint, rather than overflowing the viewport", async () => {
    await page.viewport(320, 700);
    const handle = mountCup();
    handle.roll(ROLL);
    const tops = [...handle.trayElement.querySelectorAll(".hexdev-dice-scene")].map((el) => el.getBoundingClientRect().top);
    expect(new Set(tops).size).toBeGreaterThan(1);
  });
});
