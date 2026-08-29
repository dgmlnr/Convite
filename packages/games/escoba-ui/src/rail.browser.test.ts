import { afterEach, describe, expect, it } from "vitest";
import { createEscobaRail } from "./rail.js";
import { buildRailStylesheet, ensureRailStyles, RAIL_STYLE_ID } from "./rail-styles.js";

/** The rail's CONTRACT, not its looks: a handle that says what it opens, two
 * ARIA attributes that can never dangle apart, and a body the handle really
 * names. Its two SHAPES are a container query, so they belong to the scenes
 * and to the eye, never to an assertion here. */

const mounted: HTMLElement[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.remove();
  document.getElementById(RAIL_STYLE_ID)?.remove();
});

function freshRail(): ReturnType<typeof createEscobaRail> {
  const rail = createEscobaRail();
  document.body.appendChild(rail.railEl);
  mounted.push(rail.railEl);
  return rail;
}

describe("createEscobaRail — the drawer everything but the turn moved into", () => {
  it("opens closed, so a phone pays for a handle and nothing more until it is asked", () => {
    const { railEl, tabEl } = freshRail();
    expect(railEl.dataset.open).toBe("false");
    expect(tabEl.getAttribute("aria-expanded")).toBe("false");
    expect(tabEl.textContent).toBe("Tanteador");
  });

  it("names the body it controls, and the name resolves to a node that is really there", () => {
    const { railEl, bodyEl, tabEl } = freshRail();
    const controls = tabEl.getAttribute("aria-controls");
    expect(controls).toBe(bodyEl.id);
    expect(controls).not.toBe("");
    expect(railEl.querySelector(`#${CSS.escape(controls!)}`)).toBe(bodyEl);
  });

  it("gives two rails on one page two different ids — an aria-controls that resolves to someone else's body is worse than none", () => {
    expect(freshRail().bodyEl.id).not.toBe(freshRail().bodyEl.id);
  });

  it("flips aria-expanded WITH data-open on every tap, and says what the next tap will do", () => {
    const { railEl, tabEl } = freshRail();

    tabEl.click();
    expect(railEl.dataset.open).toBe("true");
    expect(tabEl.getAttribute("aria-expanded")).toBe("true");
    expect(tabEl.textContent).toBe("Cerrar tanteador");

    tabEl.click();
    expect(railEl.dataset.open).toBe("false");
    expect(tabEl.getAttribute("aria-expanded")).toBe("false");
    expect(tabEl.textContent).toBe("Tanteador");
  });

  it("is a real button, so keyboard reach and activation come for free", () => {
    const { tabEl } = freshRail();
    expect([tabEl.tagName, tabEl.type]).toEqual(["BUTTON", "button"]);
  });
});

describe("buildRailStylesheet — the rules the two shapes are made of", () => {
  it("switches shape on a CONTAINER query and never on the viewport", () => {
    const css = buildRailStylesheet();
    expect(css).toContain("@container hexdev-escoba-layout (min-width: 640px)");
    expect(css).not.toMatch(/@media[^{]*width/);
  });

  it("declares no --hx-* token: this package's shared vocabulary lives in match-styles.ts alone", () => {
    expect(buildRailStylesheet()).not.toMatch(/--hx-[a-z0-9-]+\s*:/);
  });

  it("injects at most once per document", () => {
    ensureRailStyles(document);
    ensureRailStyles(document);
    expect(document.querySelectorAll(`#${RAIL_STYLE_ID}`)).toHaveLength(1);
  });
});
