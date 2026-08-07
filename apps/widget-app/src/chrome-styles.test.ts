import { describe, expect, it } from "vitest";
import { CHROME_STYLE_ID, buildChromeStylesheet } from "./chrome-styles.js";

describe("buildChromeStylesheet (design §10: hybrid theming by zone — the lobby/selection screen is CHROME, so it takes the tenant's brand)", () => {
  it("drives every visible surface from the tenant's --gx- tokens, never a hardcoded truco-specific color", () => {
    const css = buildChromeStylesheet();

    expect(css).toMatch(/\.hexdev-gamify-chrome[^}]*var\(--gx-color-surface/);
    expect(css).toMatch(/\.hexdev-chrome-title[^}]*var\(--gx-color-on-surface/);
    expect(css).toMatch(/\.hexdev-game-card[^}]*var\(--gx-radius/);
  });

  it("never references a truco-only token (--truco-*/--deck-*) — chrome must stay generic for any future game", () => {
    const css = buildChromeStylesheet();

    expect(css).not.toMatch(/--truco-/);
    expect(css).not.toMatch(/--deck-/);
  });

  it("exposes a stable element id for idempotent injection", () => {
    expect(CHROME_STYLE_ID).toBe("hexdev-gamify-chrome-styles");
  });

  it("gives the promoted vs-bot CTA a stronger visual treatment than the plain vs-person action (zero-counter UX rule)", () => {
    const css = buildChromeStylesheet();

    expect(css).toMatch(/\[data-prominent="bot"\]/);
  });
});
