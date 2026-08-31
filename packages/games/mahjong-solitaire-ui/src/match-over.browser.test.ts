import { afterEach, describe, expect, it } from "vitest";
import { createChronometer } from "./chronometer.js";
import type { Chronometer, ChronometerClock } from "./chronometer.js";
import { MATCH_OVER_STYLE_ID, renderMahjongMatchOver } from "./match-over-view.js";
import type { MahjongOutcomeInfo } from "./match-over.js";

/**
 * THE PANEL THAT ENDS THE MATCH, and the one place a chronometer becomes
 * something a person can read.
 *
 * `match-over.test.ts` fences the sentence at its exact letters in node; this
 * file is about what reaches the DOM — and, above all, about the property the
 * spec asks for in those words: two renders at the same injected instant
 * serialize identically, so a visual baseline can hold one.
 */

const CLEARED: MahjongOutcomeInfo = { winnerIds: ["solo"] };
const DEADLOCKED: MahjongOutcomeInfo = { winnerIds: [] };

/** A clock somebody drives by hand — the same shape `chronometer.test.ts`
 * uses, repeated rather than shared because a fixture two files reach into is
 * a third thing to keep true. */
function scriptedClock(start: number): { readonly now: ChronometerClock; readonly advance: (ms: number) => void } {
  let instant = start;
  return { now: () => instant, advance: (ms) => void (instant += ms) };
}

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById(MATCH_OVER_STYLE_ID)?.remove();
});

function mounted(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

/** A chronometer that ran for `elapsedMs` and has not been read yet. */
function ranFor(elapsedMs: number): { readonly chronometer: Chronometer; readonly advance: (ms: number) => void } {
  const clock = scriptedClock(1_000);
  const chronometer = createChronometer({ resumed: false, now: clock.now })!;
  clock.advance(elapsedMs);
  return { chronometer, advance: clock.advance };
}

describe("a board somebody cleared in this page session", () => {
  it("says how long it took", () => {
    const el = mounted();
    renderMahjongMatchOver(el, { outcome: CLEARED, chronometer: ranFor(272_000).chronometer });
    expect(el.textContent).toContain("Lo resolviste en 4:32.");
  });

  it("the figure is the injected clock's and not the machine's", () => {
    // The scripted clock's epoch is 1,000. A `Date.now()` read anywhere in
    // the path produces a figure near 1.7e12 ms — about 28 million minutes —
    // so this assertion is what stands between the panel and a number nobody
    // measured.
    const el = mounted();
    renderMahjongMatchOver(el, { outcome: CLEARED, chronometer: ranFor(65_000).chronometer });
    expect(el.textContent).toContain("1:05");
    expect(el.textContent).not.toMatch(/[0-9]{4}/);
  });
});

describe("two renders at the same injected instant serialize identically", () => {
  /**
   * The spec's own scenario, in its own words, and the reason it is worth
   * having: a chronometer counting UP is exactly as nondeterministic in a
   * screenshot as `truco-ui`'s countdown counting down, and a visual baseline
   * that moves on every run is a baseline nobody can read.
   *
   * MEASURED, and recorded because it matters: this first assertion is the
   * WEAKER half. An inline `Date.now()` read produces two identical
   * serializations too — measured, not assumed, because both renders land in
   * the same millisecond. The two assertions below it are what actually
   * isolate one: the exact figure, and the instants moving apart.
   *
   * `outerHTML` AND NOT `innerHTML`, and that word was bought with a mutation
   * that came back green. `innerHTML` does not serialize the container's own
   * attributes, so a nondeterministic value written onto the container — a
   * `data-` attribute, or the `aria-label` this panel really does put the
   * elapsed figure into — stayed invisible to this comparison. The point of
   * the fence is that a picture of this element is reproducible, and a
   * picture includes the element.
   */
  it("the same panel twice", () => {
    const el = mounted();
    const { chronometer } = ranFor(272_000);
    renderMahjongMatchOver(el, { outcome: CLEARED, chronometer });
    const first = el.outerHTML;
    renderMahjongMatchOver(el, { outcome: CLEARED, chronometer });
    expect(el.outerHTML).toBe(first);
  });

  it("and the serialization is not empty, so the equality above says something", () => {
    // R6. Two blank containers are also identical.
    const el = mounted();
    renderMahjongMatchOver(el, { outcome: CLEARED, chronometer: ranFor(272_000).chronometer });
    expect(el.outerHTML.length).toBeGreaterThan(0);
    expect(el.outerHTML).toContain("4:32");
  });

  it("and at two instants TEN MINUTES apart, because the figure freezes at the finish", () => {
    /**
     * The panel sits on screen while the player reads it, and any later view
     * repaints it. A reading taken on each repaint would climb while nobody
     * was playing — the number the player finally looked away from would be
     * "how long the message was open". The freeze lives in `chronometer.ts`;
     * this is the assertion that says it reaches the DOM.
     */
    const el = mounted();
    const { chronometer, advance } = ranFor(272_000);
    renderMahjongMatchOver(el, { outcome: CLEARED, chronometer });
    const first = el.outerHTML;
    advance(600_000);
    renderMahjongMatchOver(el, { outcome: CLEARED, chronometer });
    expect(el.outerHTML).toBe(first);
    expect(el.textContent).toContain("4:32");
  });
});

describe("a RESUMED match", () => {
  /**
   * There is no chronometer to hand over: `createChronometer` returns `null`
   * on that path, because a closure started at first render would be
   * measuring time since the RELOAD. The panel therefore has no figure to
   * print, and the honesty is structural — not a rule this file has to
   * remember.
   */
  it("shows no elapsed-time figure at all", () => {
    const el = mounted();
    renderMahjongMatchOver(el, { outcome: CLEARED, chronometer: null });
    expect(el.textContent).toContain("Lo resolviste.");
    expect(el.textContent).not.toMatch(/[0-9]/);
  });

  it("and a match joined fresh in the same page session does show one", () => {
    // Each scenario is the other's discriminator: "never show a time" passes
    // the one above, "always show a time" passes this one, and only reading
    // the chronometer's presence passes both.
    const el = mounted();
    renderMahjongMatchOver(el, { outcome: CLEARED, chronometer: ranFor(272_000).chronometer });
    expect(el.textContent).toMatch(/[0-9]/);
  });
});

describe("a deadlocked board", () => {
  it("says the pinned sentence and carries no figure, with a live chronometer in hand", () => {
    // R18: the refused input is present. A deadlock rendered with no
    // chronometer would pass against a panel that prints whatever it is
    // given, because there would be nothing to print.
    const el = mounted();
    renderMahjongMatchOver(el, { outcome: DEADLOCKED, chronometer: ranFor(683_000).chronometer });
    expect(el.textContent).toContain("Te quedaste sin pares. Siempre hay una salida — probá otro.");
    expect(el.textContent).not.toMatch(/[0-9]/);
  });
});

describe("the panel as a screen", () => {
  it("is a modal dialog with an accessible name, and takes focus when it opens", () => {
    const el = mounted();
    renderMahjongMatchOver(el, { outcome: CLEARED, chronometer: null, focusOnOpen: true });
    expect(el.getAttribute("role")).toBe("dialog");
    expect(el.getAttribute("aria-modal")).toBe("true");
    // The name IS the sentence — there is nothing else here it could be, and
    // a dialog with no name is worse than not claiming to be one.
    expect(el.getAttribute("aria-label")).toBe("Lo resolviste.");
    expect(document.activeElement).toBe(el);
  });

  it("null clears it, attributes included", () => {
    const el = mounted();
    renderMahjongMatchOver(el, { outcome: CLEARED, chronometer: null });
    expect(el.textContent).not.toBe("");
    renderMahjongMatchOver(el, null);
    expect(el.textContent).toBe("");
    expect(el.getAttribute("role")).toBeNull();
    expect(el.getAttribute("aria-label")).toBeNull();
  });

  it("offers another board, and the way back", () => {
    const el = mounted();
    let again = 0;
    let left = 0;
    renderMahjongMatchOver(el, {
      outcome: DEADLOCKED,
      chronometer: null,
      onPlayAgain: () => (again += 1),
      onLeaveMatch: () => (left += 1),
    });
    el.querySelector<HTMLButtonElement>('button[data-action="play-again"]')!.click();
    el.querySelector<HTMLButtonElement>('button[data-action="leave-match"]')!.click();
    expect(again).toBe(1);
    expect(left).toBe(1);
  });

  it("a caller with nowhere to send anybody gets no leave button", () => {
    const el = mounted();
    renderMahjongMatchOver(el, { outcome: CLEARED, chronometer: null, onPlayAgain: () => undefined });
    expect(el.querySelector('button[data-action="play-again"]')).not.toBeNull();
    expect(el.querySelector('button[data-action="leave-match"]')).toBeNull();
  });
});
