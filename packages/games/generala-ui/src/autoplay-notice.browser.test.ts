import { afterEach, describe, expect, it } from "vitest";

import { renderGeneralaAutoplayNotice } from "./autoplay-notice.js";
import { AUTOPLAY_NOTICE_STYLE_ID } from "./autoplay-notice-styles.js";
import { renderServidaCallout } from "./servida.js";
import { createMatch, getViewFor } from "@hexdev/generala-engine";
import type { PlayerId } from "@hexdev/generala-engine";
import { applyRoll } from "@hexdev/generala-engine";

/**
 * THE PANEL THAT EXPLAINS A MOVE NOBODY AT THIS SCREEN MADE.
 *
 * `announcer.browser.test.ts` proves the DERIVATION — which boxes count as the
 * bot's and which do not. This file is about the thing that stays on screen
 * afterwards, and it has exactly two jobs the region cannot do: it persists,
 * and it cannot be mistaken for the other inline note on this board.
 */

const SEAT = "notice-self" as PlayerId;
const RIVAL = "notice-rival" as PlayerId;

const mounted: HTMLElement[] = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
});

function freshContainer(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

const noticeIn = (el: HTMLElement): HTMLElement | null => el.querySelector<HTMLElement>(".hexdev-generala-autoplay");

describe("generala autoplay notice: what it says, and what it refuses to leave out", () => {
  it("names the cause, the box, the value, and that the seat is still yours", () => {
    const el = freshContainer();
    renderGeneralaAutoplayNotice(el, { category: "poker", value: 0 });

    const said = noticeIn(el)?.textContent ?? "";
    // THE CAUSE FIRST, because the box is the consequence of it and the box is
    // the only part the player can already see.
    expect(said).toContain("Se acabó tu tiempo");
    // The box by the planilla's own name, and the value out loud: a category
    // spent for nothing is the most consequential thing that can be on a card.
    expect(said).toContain("Póker");
    expect(said).toContain("0");
    // AND THE PART A PLAYER CANNOT DERIVE FROM ANYTHING ON SCREEN. `MatchRoom`
    // leaves the controller alone on a timeout — unlike a disconnect, which
    // hands the seat over — so the next turn is theirs with a fresh clock.
    // Nothing else on this board says so.
    expect(said).toContain("El asiento sigue siendo tuyo");
  });

  it("says a real score out loud too, not only a crossed-out zero", () => {
    const el = freshContainer();
    renderGeneralaAutoplayNotice(el, { category: "sixes", value: 18 });

    expect(noticeIn(el)?.textContent).toContain("18 en Seises");
  });

  it("draws nothing at all when there is nothing to explain", () => {
    const el = freshContainer();
    renderGeneralaAutoplayNotice(el, { category: "full", value: 0 });
    expect(noticeIn(el)).not.toBeNull();

    renderGeneralaAutoplayNotice(el, null);
    expect(noticeIn(el), "the board takes it down by handing back nothing").toBeNull();
    expect(el.textContent).toBe("");
  });

  it("injects its sheet once however many times it is rendered", () => {
    const el = freshContainer();
    renderGeneralaAutoplayNotice(el, { category: "full", value: 0 });
    renderGeneralaAutoplayNotice(el, null);
    renderGeneralaAutoplayNotice(el, { category: "full", value: 0 });

    expect(document.querySelectorAll(`#${AUTOPLAY_NOTICE_STYLE_ID}`)).toHaveLength(1);
  });
});

describe("generala autoplay notice: it is not a live region, and that is the point", () => {
  it("announces nothing on its own", () => {
    const el = freshContainer();
    renderGeneralaAutoplayNotice(el, { category: "poker", value: 0 });

    // THE REGION ALREADY SAID THIS. `announcer.ts` amends its own sentence for
    // the same event, and two live regions carrying one event read it twice —
    // once politely queued behind the other. What this panel adds is that it
    // STAYS, for the player who was not looking when it happened. A screen
    // reader still reaches the text by navigating to it; it simply is not
    // shouted a second time.
    expect(noticeIn(el)?.closest("[aria-live]")).toBeNull();
    expect(el.querySelectorAll("[aria-live]")).toHaveLength(0);
  });

  it("keeps the drawn clock out of the accessibility tree, since the sentence already says it", () => {
    const el = freshContainer();
    renderGeneralaAutoplayNotice(el, { category: "poker", value: 0 });

    const mark = noticeIn(el)?.querySelector(".hexdev-generala-autoplay-mark");
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    // And it contributes nothing to the text, so the sentence above is the
    // whole of what is read.
    expect(noticeIn(el)?.textContent?.startsWith("Se acabó")).toBe(true);
  });
});

describe("generala autoplay notice: it cannot be mistaken for the note beside it", () => {
  /** Both notes at once, which is a position a real board reaches: a turn
   * taken over, the rival's answer, and then a servida throw of your own. */
  function bothNotes(): { readonly notice: HTMLElement; readonly callout: HTMLElement } {
    const el = freshContainer();
    const noticeEl = document.createElement("div");
    const calloutEl = document.createElement("div");
    el.append(calloutEl, noticeEl);
    const rolled = applyRoll(createMatch([SEAT, RIVAL]), [1, 2, 3, 4, 5]);
    if (!rolled.ok) throw new Error(`fence setup: the engine refused the throw — ${rolled.violation.code}`);
    renderServidaCallout(calloutEl, getViewFor(rolled.state, SEAT));
    renderGeneralaAutoplayNotice(noticeEl, { category: "poker", value: 0 });
    const callout = calloutEl.querySelector<HTMLElement>(".hexdev-generala-servida");
    const notice = noticeEl.querySelector<HTMLElement>(".hexdev-generala-autoplay");
    if (callout === null || notice === null) throw new Error("fence setup: both notes must be on screen for this to be a comparison");
    return { notice, callout };
  }

  it("is boxed on all four sides where the callout is ruled on one", () => {
    const { notice, callout } = bothNotes();
    const noticeStyle = getComputedStyle(notice);
    const calloutStyle = getComputedStyle(callout);

    // THE STRUCTURAL DIFFERENCE, and it is the one that survives being
    // colour-blind, being on a themed tenant, and being read at arm's length.
    // The callout carries its whole edge on the leading side; this one carries
    // all four.
    expect(calloutStyle.borderTopWidth).toBe("0px");
    expect(calloutStyle.borderLeftWidth).not.toBe("0px");
    for (const side of [noticeStyle.borderTopWidth, noticeStyle.borderRightWidth, noticeStyle.borderBottomWidth, noticeStyle.borderLeftWidth]) {
      expect(side).not.toBe("0px");
    }
  });

  it("carries a drawn mark the callout does not, so the two differ before a word is read", () => {
    const { notice, callout } = bothNotes();

    expect(notice.querySelector("svg"), "the clock").not.toBeNull();
    expect(callout.querySelector("svg"), "and the callout has none, which is what makes it a difference").toBeNull();
  });
});
