import { afterEach, describe, expect, it } from "vitest";
import { TABLE_STYLE_ID, ensureTableStyles } from "./table-styles.js";

afterEach(() => {
  document.getElementById(TABLE_STYLE_ID)?.remove();
  for (const node of [...document.body.querySelectorAll(".hexdev-truco-call, .hexdev-truco-calls-group, .hexdev-truco-senas-toggle")]) node.remove();
});

describe("ensureTableStyles", () => {
  it("injects exactly one <style> element into <head>, even when called twice", () => {
    ensureTableStyles(document);
    ensureTableStyles(document);

    expect(document.head.querySelectorAll(`#${TABLE_STYLE_ID}`)).toHaveLength(1);
  });
});

/**
 * Debt (repo owner: "quiero que el botón Señas se adapte mejor estéticamente
 * ... que se vea más integrado y estético al resto").
 *
 * MEASURED CAUSE, rendered rather than read off the source: the toggle differed
 * from the call buttons it sits beside in SIZE, not only in tone — 59.73x32
 * against 76.36x40, min-height 32px vs 40px, padding 4px 12px vs 6px 16px,
 * font-size 12px (--hx-text-meta) vs 14.4px (--hx-text-body) — and it still
 * carried a HARDCODED "0 2px 8px rgba(0,0,0,0.4)" from before the --hx-elev-*
 * scale existed, while every other surface on this table had migrated to the
 * tokens. Two buttons on one strip at two different sizes read as two systems.
 *
 * These are computed-style fences rather than rendered-geometry ones on purpose:
 * the property that matters is that the two rules stay in AGREEMENT, and
 * comparing them directly is what makes a future divergence fail here instead of
 * drifting back one declaration at a time. A bare element is enough — every
 * value below comes from the base rules and the :root token block, neither of
 * which needs a mounted table.
 */
describe("action-bar button system (debt: the señas toggle is a member of it, not a smaller cousin)", () => {
  function mountButtons(): { readonly call: HTMLElement; readonly openingCall: HTMLElement; readonly toggle: HTMLElement } {
    ensureTableStyles(document);
    const call = document.createElement("button");
    call.className = "hexdev-truco-call";
    // The established SECONDARY treatment, and the one the toggle must match in
    // tone: an opening-group call is outlined where a response-group call is
    // filled. It needs its group ancestor for that rule to apply at all.
    const group = document.createElement("div");
    group.className = "hexdev-truco-calls-group hexdev-truco-calls-group--opening";
    const openingCall = document.createElement("button");
    openingCall.className = "hexdev-truco-call";
    group.appendChild(openingCall);
    const toggle = document.createElement("button");
    toggle.className = "hexdev-truco-senas-toggle";
    document.body.append(call, group, toggle);
    return { call, openingCall, toggle };
  }

  it("gives the señas toggle the call buttons' own size rhythm, type scale and elevation token", () => {
    const { call, toggle } = mountButtons();

    const callStyle = getComputedStyle(call);
    const toggleStyle = getComputedStyle(toggle);
    expect(toggleStyle.minHeight, "min-height").toBe(callStyle.minHeight);
    expect(toggleStyle.fontSize, "font-size").toBe(callStyle.fontSize);
    expect(toggleStyle.fontWeight, "font-weight").toBe(callStyle.fontWeight);
    expect(toggleStyle.paddingTop, "padding-block").toBe(callStyle.paddingTop);
    expect(toggleStyle.paddingLeft, "padding-inline").toBe(callStyle.paddingLeft);
    expect(toggleStyle.borderRadius, "border-radius").toBe(callStyle.borderRadius);
    // The hardcoded pre-token shadow is gone: both read the same --hx-elev-*.
    expect(toggleStyle.boxShadow, "elevation").toBe(callStyle.boxShadow);
  });

  it("keeps the toggle SECONDARY in tone — the opening group's outline treatment, never the filled primary (spec: discoverable without being noisy)", () => {
    const { openingCall, toggle } = mountButtons();

    const openingStyle = getComputedStyle(openingCall);
    const toggleStyle = getComputedStyle(toggle);
    expect(toggleStyle.backgroundColor, "an outlined button has no fill of its own").toBe(openingStyle.backgroundColor);
    expect(toggleStyle.borderWidth, "border-width").toBe(openingStyle.borderWidth);
    expect(toggleStyle.borderStyle, "border-style").toBe(openingStyle.borderStyle);
    expect(toggleStyle.borderColor, "border-color").toBe(openingStyle.borderColor);
    expect(toggleStyle.color, "text colour").toBe(openingStyle.color);
  });

  it("marks the OPEN toggle with a gold border and gold label, still selecting on aria-expanded so the a11y state stays the style hook", () => {
    const { openingCall, toggle } = mountButtons();
    const closedBorder = getComputedStyle(toggle).borderColor;

    toggle.setAttribute("aria-expanded", "true");

    const openStyle = getComputedStyle(toggle);
    expect(openStyle.borderColor, "the open toggle's border must leave the closed/secondary colour").not.toBe(closedBorder);
    expect(openStyle.color, "the open toggle's label goes gold with its border").toBe(openStyle.borderColor);
    // Still an OUTLINED button: opening the picker must not promote it to the
    // filled primary treatment.
    expect(openStyle.backgroundColor, "still outlined, never filled").toBe(getComputedStyle(openingCall).backgroundColor);
    // And the inset-ring era is over — a 1px inset ring inside a real 2px
    // border is what this rework replaced, so it must not come back.
    expect(openStyle.boxShadow, "no inset ring inside the border").not.toMatch(/inset/);
  });
});

// T-11 (design §5.3: "how it holds by construction") — the height contract at
// the CSS level, not only at the rendered-height level (that's T-7's job,
// table-height-stability.browser.test.ts). A non-empty child keeps the
// `:empty { display: none }` rule from suppressing the computed values below.
describe("call-log panel height contract (T-11: the panel must never grow the felt)", () => {
  it("is position: absolute, with a fixed px max-height derived from --truco-card-width — never vh, never content-driven", () => {
    ensureTableStyles(document);
    const panel = document.createElement("div");
    panel.className = "hexdev-truco-call-log";
    panel.style.setProperty("--truco-card-width", "60px");
    panel.appendChild(document.createElement("p"));
    document.body.appendChild(panel);

    const computed = getComputedStyle(panel);
    expect(computed.position).toBe("absolute");
    expect(computed.maxHeight).toMatch(/^\d+(\.\d+)?px$/); // a resolved length, not "none"/a percentage/a raw calc()
    expect(computed.maxHeight).not.toBe("none");

    panel.remove();
  });
});
