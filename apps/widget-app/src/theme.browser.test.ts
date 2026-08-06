import { afterEach, describe, expect, it } from "vitest";
import { applyThemeToRoot } from "./theme.js";

let root: HTMLElement;

afterEach(() => {
  root.remove();
});

function freshRoot(): HTMLElement {
  root = document.createElement("div");
  document.body.appendChild(root);
  return root;
}

describe("applyThemeToRoot (design §10: hybrid theming by zone — chrome/lobby/selection take the tenant brand)", () => {
  it("sets every valid token from the closed vocabulary as a CSS custom property", () => {
    const el = freshRoot();

    applyThemeToRoot(el, { "--gx-color-primary": "#336699", "--gx-radius": "8px" });

    expect(el.style.getPropertyValue("--gx-color-primary")).toBe("#336699");
    expect(el.style.getPropertyValue("--gx-radius")).toBe("8px");
  });

  it("drops a value that fails its token's own regex, leaving the property unset (re-sanitized, never trusted blindly from postMessage)", () => {
    const el = freshRoot();

    applyThemeToRoot(el, { "--gx-color-primary": "javascript:alert(1)" });

    expect(el.style.getPropertyValue("--gx-color-primary")).toBe("");
  });

  it("no-ops without throwing when no theme was supplied at all", () => {
    const el = freshRoot();

    expect(() => applyThemeToRoot(el, undefined)).not.toThrow();
  });
});
