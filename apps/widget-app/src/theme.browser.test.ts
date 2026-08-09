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

describe("precedence rule (design §10, decided in this unit): the host page's own override wins per-token over the tenant's server-delivered theme", () => {
  // `main.ts` applies the tenant's server-delivered theme (`bootstrap.theme`)
  // FIRST, as soon as it is readable — before the `host-hello` handshake
  // even completes, honoring "zero loader involvement" for the primary path
  // — then applies the host page's own `data-theme-*` override (if any) on
  // TOP of it, exactly like this test does. `applyThemeToRoot` only ever
  // calls `style.setProperty` for a token PRESENT in its own argument, so
  // calling it twice is the whole merge mechanism: no separate "resolve
  // precedence" function is needed, and no third call can un-set a token the
  // other call already set.
  //
  // Justification for host-wins, not tenant-wins: the widget-protocol
  // header itself already names this "Host-supplied theme overrides" — the
  // word "override" already means "wins." More importantly, the host page
  // is not a third party here: it is the SAME tenant's own site (the
  // `<script>` tag lives in markup that tenant controls). Letting that page
  // customize a token per-embed (a seasonal campaign skin, a
  // section-specific accent) without waiting on a config change through us
  // is strictly MORE precise tenant intent than the coarser, centrally
  // configured server default — never a hostile third party overriding a
  // tenant's own brand.
  it("a host-page token set AFTER the tenant's server theme overrides it; a tenant token the host page never mentions survives untouched", () => {
    const el = freshRoot();

    applyThemeToRoot(el, { "--gx-color-primary": "#111111", "--gx-color-accent": "#222222" }); // tenant/server theme, applied first
    applyThemeToRoot(el, { "--gx-color-primary": "#ffffff" }); // host-page override, applied second

    expect(el.style.getPropertyValue("--gx-color-primary")).toBe("#ffffff"); // host page wins
    expect(el.style.getPropertyValue("--gx-color-accent")).toBe("#222222"); // untouched tenant value survives
  });

  it("a tenant theme alone (no host override at all) is exactly what renders — theming is optional per side, not all-or-nothing", () => {
    const el = freshRoot();

    applyThemeToRoot(el, { "--gx-color-primary": "#111111" });
    applyThemeToRoot(el, {}); // host page offered no `data-theme-*` attributes at all

    expect(el.style.getPropertyValue("--gx-color-primary")).toBe("#111111");
  });
});
