import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_THEME_TOKENS, themeTokensToCss } from "@hexdev/widget-protocol";

import themeBridgeCss from "./theme-bridge.css?raw";

/**
 * theme-bridge.test.ts (task 13b.2, design §13.3-13.4) — a `.browser.test.ts`
 * so this runs in REAL Chromium (`vitest.config.ts`'s `browser` project,
 * `scripts/browser-test-include.mjs`), never jsdom: the whole point is a
 * REAL browser's CSS engine deciding what a custom-property chain resolves
 * to, which is the one thing a text-based assertion cannot stand in for.
 *
 * THE TRAP THIS FILE EXISTS TO CATCH (Part A tasks §0.3): Tailwind v3-era
 * shadcn recipes store space-separated HSL channel triples
 * (`--primary: 222.2 47.4% 11.2%`), consumed as `hsl(var(--primary))`.
 * `--gx-*` tokens are full CSS colors. Feed one into a channel-triple slot
 * and the browser computes `hsl(#2f6f4f)` — invalid syntax, so it drops the
 * WHOLE declaration and the property falls back to its initial value
 * (`rgba(0, 0, 0, 0)` for `background-color`) — rendering nothing, and
 * erroring nowhere: no console warning, no failed build, and a test that
 * only reads DECLARATION TEXT (`"background-color: hsl(var(--primary))"`)
 * would still see a perfectly well-formed string and pass. Only a COMPUTED
 * value, read off a real rendered node, can tell the two apart — which is
 * exactly what every assertion below does via `getComputedStyle`.
 */

/**
 * Every `DEFAULT_THEME_TOKENS` color is a plain 6-digit hex (its own
 * `sanitizeThemeOverride` pattern guarantees the shape) — converted here
 * rather than hand-typed a second time as an `rgb(...)` literal, the same
 * "single source, no duplication" discipline task 13a itself exists for.
 */
function hexToRgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

let injected: readonly HTMLStyleElement[] = [];

function inject(css: string): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  injected = [...injected, style];
  return style;
}

function probeElement(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.append(el);
  return el;
}

afterEach(() => {
  for (const style of injected) style.remove();
  injected = [];
  document.body.replaceChildren();
});

describe("theme-bridge.css (real Chromium): every bridged property resolves to a real computed color", () => {
  it("--primary computes to a real, non-transparent color once the --gx-* defaults are emitted", () => {
    inject(themeTokensToCss());
    inject(themeBridgeCss);
    inject(".probe-primary { background-color: var(--primary); }");
    const el = probeElement();
    el.className = "probe-primary";

    const computed = getComputedStyle(el).backgroundColor;

    expect(computed).toBe(hexToRgb(DEFAULT_THEME_TOKENS["--gx-color-primary"]));
    expect(computed).not.toBe("");
    expect(computed).not.toBe("rgba(0, 0, 0, 0)");
  });

  it("--background/--foreground/--primary-foreground/--accent each resolve to their bridged --gx-* value", () => {
    inject(themeTokensToCss());
    inject(themeBridgeCss);
    inject(
      ".probe-background { background-color: var(--background); } " +
        ".probe-foreground { color: var(--foreground); } " +
        ".probe-primary-foreground { color: var(--primary-foreground); } " +
        ".probe-accent { background-color: var(--accent); }",
    );

    const background = probeElement();
    background.className = "probe-background";
    const foreground = probeElement();
    foreground.className = "probe-foreground";
    const primaryForeground = probeElement();
    primaryForeground.className = "probe-primary-foreground";
    const accent = probeElement();
    accent.className = "probe-accent";

    expect(getComputedStyle(background).backgroundColor).toBe(hexToRgb(DEFAULT_THEME_TOKENS["--gx-color-surface"]));
    expect(getComputedStyle(foreground).color).toBe(hexToRgb(DEFAULT_THEME_TOKENS["--gx-color-on-surface"]));
    expect(getComputedStyle(primaryForeground).color).toBe(hexToRgb(DEFAULT_THEME_TOKENS["--gx-color-on-primary"]));
    expect(getComputedStyle(accent).backgroundColor).toBe(hexToRgb(DEFAULT_THEME_TOKENS["--gx-color-accent"]));
  });

  it("a --gx-* override propagates through the bridge into the computed value, not just the default", () => {
    inject(themeTokensToCss({ "--gx-color-primary": "#336699" }));
    inject(themeBridgeCss);
    inject(".probe-primary { background-color: var(--primary); }");
    const el = probeElement();
    el.className = "probe-primary";

    expect(getComputedStyle(el).backgroundColor).toBe("rgb(51, 102, 153)");
  });

  /**
   * THE ADVERSARIAL HALF, and the reason this suite exists at all: proves
   * the assertion style above actually discriminates the trap rather than
   * merely happening to pass. `hsl(var(--primary))` is the Tailwind v3
   * consumption pattern this bridge deliberately does NOT use (globals.css's
   * own `@theme inline` block reads `--primary` bare, never wrapped) — wired
   * here on a throwaway probe class, never on the real bridge, to show what
   * WOULD happen if a future edit reintroduced it.
   */
  it("documents the trap: wrapping the same full-color token in hsl() computes to nothing, not an error", () => {
    inject(themeTokensToCss());
    inject(themeBridgeCss);
    inject(".probe-trap { background-color: hsl(var(--primary)); }");
    const el = probeElement();
    el.className = "probe-trap";

    const computed = getComputedStyle(el).backgroundColor;

    // hsl(#2f6f4f) is invalid CSS syntax: the whole declaration is dropped,
    // so the property reads back at its initial value — silently, with no
    // exception anywhere in this test and nothing in a browser console.
    expect(computed).toBe("rgba(0, 0, 0, 0)");
    expect(computed).not.toBe(hexToRgb(DEFAULT_THEME_TOKENS["--gx-color-primary"]));
  });
});
