import { afterEach, describe, expect, it } from "vitest";
import { TABLE_STYLE_ID, ensureTableStyles } from "./table-styles.js";

afterEach(() => {
  document.getElementById(TABLE_STYLE_ID)?.remove();
});

describe("ensureTableStyles", () => {
  it("injects exactly one <style> element into <head>, even when called twice", () => {
    ensureTableStyles(document);
    ensureTableStyles(document);

    expect(document.head.querySelectorAll(`#${TABLE_STYLE_ID}`)).toHaveLength(1);
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
