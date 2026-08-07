import { describe, expect, it } from "vitest";
import { TABLE_STYLE_ID, buildTableStylesheet } from "./table-styles.js";

describe("buildTableStylesheet (design §10: hybrid theming by zone)", () => {
  it("supplies a real default for every deck-back and matchstick token, so the SVGs never fall back to browser-initial black", () => {
    const css = buildTableStylesheet();

    expect(css).toContain("--deck-back-bg:");
    expect(css).toContain("--deck-back-accent:");
    expect(css).toContain("--truco-match-wood-1:");
    expect(css).toContain("--truco-match-head-1:");
  });

  it("keeps the table cloth its own fixed identity, never a --gx- tenant token", () => {
    const css = buildTableStylesheet();

    expect(css).toContain("--truco-table-cloth:");
  });

  it("drives chrome/controls (calls, score labels) from the tenant's --gx- tokens, not a hardcoded color", () => {
    const css = buildTableStylesheet();

    expect(css).toMatch(/\.hexdev-truco-call[^}]*var\(--gx-color-/);
  });

  it("exposes a stable element id for idempotent injection", () => {
    expect(TABLE_STYLE_ID).toBe("hexdev-truco-table-styles");
  });
});
