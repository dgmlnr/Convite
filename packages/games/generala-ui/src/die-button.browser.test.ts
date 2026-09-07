import { page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import { ensureDiceStyles } from "@hexdev/dice-ui";
import type { DieFace } from "@hexdev/generala-engine";

import { createDieSlot } from "./die-button.js";
import { ensureTrayStyles } from "./tray-styles.js";

/**
 * ONE DIE, AS A CONTROL — and the size it brings with it.
 *
 * A hold is a RULE, so nothing in this file knows what one is. `dice-ui`
 * cannot learn a rule (its own barrel says so, and `l0-dice-ui-no-workspace-
 * deps` enforces it), and `die-button.ts` deliberately does not either: it
 * draws a die as a real `<button aria-pressed>` and reports that somebody
 * pressed it. Which presses are legal, what they add up to, and which single
 * action leaves — all of that belongs to the tray, one slice away, and to the
 * engine's own offer list underneath it.
 *
 * WHY A NATIVE BUTTON AND NOT `role="button"`. Four things come free and the
 * fourth is the one that is always forgotten: tab order, Enter, Space, and a
 * real `disabled` that removes it from both. The keyboard block below spends
 * every one of them without a pointer event anywhere in the interaction,
 * which is the only way to tell a native control from a div that has learned
 * three quarters of one.
 *
 * THE ONE MEASUREMENT THAT IS THIS FILE'S. Slice 12 put the sized box inside
 * `dice-ui` precisely so a board composing dice would own no pixels, and this
 * package names none: the gap a thrown die leaves is asserted to be exactly
 * as wide as the die, and it is written that way — one box compared against
 * the other — rather than against a number this file would have to keep in
 * step with the responsive ladder. What five of these do to a wrapping row at
 * every supported width is the TRAY's claim, and it is measured where the
 * tray is.
 */

const ROLL: readonly DieFace[] = [3, 5, 1, 2, 6];

const mounted: HTMLElement[] = [];
afterEach(async () => {
  while (mounted.length > 0) mounted.pop()!.remove();
  await page.viewport(414, 896);
});

interface LaidTray {
  readonly tray: HTMLElement;
  readonly nodes: readonly HTMLElement[];
  readonly buttons: readonly HTMLButtonElement[];
  readonly pressed: readonly number[];
}

/** Five slots in the row the stylesheet lays out, built straight from
 * `createDieSlot` — no tray renderer involved, because there is not one yet
 * and because these claims are about a die and not about a turn. */
function layTray(faces: readonly (DieFace | null)[]): LaidTray {
  ensureDiceStyles(document);
  ensureTrayStyles(document);

  const pressed: number[] = [];
  const tray = document.createElement("div");
  tray.className = "hexdev-generala-tray";
  const slots = faces.map((face, index) => createDieSlot(document, face, index, (i) => pressed.push(i)));
  tray.append(...slots.map((slot) => slot.node));
  document.body.appendChild(tray);
  mounted.push(tray);

  return {
    tray,
    nodes: slots.map((slot) => slot.node),
    buttons: slots.map((slot) => slot.button).filter((button): button is HTMLButtonElement => button !== null),
    pressed,
  };
}

describe("a die is a real control, and it says which die it is", () => {
  it("is a <button> carrying aria-pressed and an accessible name the artwork cannot give it", () => {
    const laid = layTray(ROLL);

    expect(laid.buttons, "five faces, five controls").toHaveLength(5);
    for (const button of laid.buttons) {
      expect(button.tagName, "a div with role=button would re-implement Enter and Space by hand").toBe("BUTTON");
      expect(button.type, "a button inside a form must not submit it").toBe("button");
      expect(button.getAttribute("aria-pressed"), "a die starts in the cup's own state: not held").toBe("false");
    }

    // `dice-ui` marks every facelet image `alt=""` on purpose — a cube ships
    // all six numbers permanently, so five of them are never the decided face
    // — which leaves the button with no accessible name at all unless this
    // package gives it one.
    expect(laid.buttons[0]!.getAttribute("aria-label")).toBe("Dado 1: 3");
    expect(laid.buttons[2]!.getAttribute("aria-label"), "the position is one-based for a human, the index is not").toBe("Dado 3: 1");
  });

  it("reports its own index and nobody else's, so five identical faces are still five distinguishable dice", () => {
    const laid = layTray([4, 4, 4, 4, 4]);

    laid.buttons[3]!.click();
    expect(laid.pressed, "holding 'a 4' cannot say which one; holding index 3 says it exactly").toEqual([3]);

    laid.buttons[0]!.click();
    laid.buttons[3]!.click();
    expect(laid.pressed, "every press is reported, in order, and nothing is collapsed").toEqual([3, 0, 3]);
  });
});

describe("a die is reachable and operable with no pointer anywhere in the interaction", () => {
  it("takes focus, activates on Enter, tabs to the next die and activates on Space", async () => {
    const laid = layTray(ROLL);

    laid.buttons[0]!.focus();
    expect(document.activeElement, "a native button is focusable without a tabindex of its own").toBe(laid.buttons[0]);

    await userEvent.keyboard("{Enter}");
    expect(laid.pressed, "Enter activates a native button").toEqual([0]);

    await userEvent.tab();
    expect(document.activeElement, "the next die is the next tab stop, in slot order").toBe(laid.buttons[1]);

    await userEvent.keyboard(" ");
    expect(laid.pressed, "Space activates a native button too, and a role=button div does neither").toEqual([0, 1]);
  });
});

describe("holding a die does not move the four beside it", () => {
  it("lifts the held die without resizing it, and leaves every other box exactly where it was", async () => {
    await page.viewport(1280, 900);
    const laid = layTray(ROLL);
    const before = laid.nodes.map((node) => node.getBoundingClientRect());
    expect(before[1]!.left - before[0]!.right, "five dice must read as five: adjacent ones never touch").toBeGreaterThan(0);

    laid.buttons[0]!.setAttribute("aria-pressed", "true");

    // THE BORDER IS RESERVED ON EVERY DIE, TRANSPARENT UNTIL IT IS HELD, and
    // this is the whole reason. Declared only on the held one it would widen
    // that flex item by 4px the instant it was pressed, and the four dice
    // beside it would step sideways under the player's finger.
    for (let index = 1; index < laid.nodes.length; index += 1) {
      const now = laid.nodes[index]!.getBoundingClientRect();
      expect(now.left, `die ${String(index)} must not move when its neighbour is held`).toBeCloseTo(before[index]!.left, 1);
      expect(now.top).toBeCloseTo(before[index]!.top, 1);
    }

    // The lift is a `transform`, which is paint-time and reflows nothing —
    // the same property slice 12 spent a whole fence on one tier down.
    const lifted = laid.nodes[0]!.getBoundingClientRect();
    expect(lifted.width, "the held die is not a bigger die").toBeCloseTo(before[0]!.width, 1);
    expect(lifted.top, "it is drawn 6px higher, and that is all").toBeCloseTo(before[0]!.top - 6, 1);
  });
});

describe("a thrown die leaves a gap the row can measure", () => {
  it("draws a slot that is not a control, is hidden from assistive tech, and is exactly as wide as the die that will land in it", () => {
    const laid = layTray([3, 5, null, null, null]);

    expect(laid.buttons, "two dice are still on the table; three are in the cup").toHaveLength(2);
    const gap = laid.nodes[2]!;
    expect(gap.tagName, "there is nothing to press in an empty slot").not.toBe("BUTTON");
    expect(gap.getAttribute("aria-hidden"), "'a die is being thrown' is the announcer's sentence, not three empty boxes'").toBe("true");

    // THE WHOLE REASON THE GAP IS DRAWN AT ALL. Remove it and the row reflows
    // twice per throw — narrower in flight, wider on landing — so the two dice
    // the player HELD jump sideways under their finger.
    const die = laid.nodes[0]!.getBoundingClientRect();
    expect(gap.getBoundingClientRect().width).toBeCloseTo(die.width, 1);
    expect(gap.getBoundingClientRect().height).toBeCloseTo(die.height, 1);
  });
});
