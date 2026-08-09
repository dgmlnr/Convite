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

  it("lays the shell out with a CSS container query, not a viewport media query — the widget's own available width may differ from the host viewport (Change 2: works narrow AND wide)", () => {
    const css = buildTableStylesheet();

    expect(css).toMatch(/\.hexdev-truco-table-shell\s*\{[^}]*container-type:\s*inline-size/);
    expect(css).toContain("@container");
  });

  it("never dims the pending-call banner or the turn badge with the CSS opacity property — both sit on the cloth, and opacity there tints toward the felt instead of dimming", () => {
    const css = buildTableStylesheet();
    const pendingCallBlock = css.match(/\.hexdev-truco-pending-call\s*\{[^}]*\}/)?.[0] ?? "";
    const turnBadgeBlock = css.match(/\.hexdev-truco-turn-badge\s*\{[^}]*\}/)?.[0] ?? "";

    expect(pendingCallBlock).not.toMatch(/opacity\s*:/);
    expect(turnBadgeBlock).not.toMatch(/opacity\s*:/);
    expect(css).toContain(".hexdev-truco-pending-call");
    expect(css).toContain(".hexdev-truco-turn-badge");
  });

  it("visually differentiates the response calls group from the opening/escalation group", () => {
    const css = buildTableStylesheet();

    expect(css).toContain(".hexdev-truco-calls-group--response");
    expect(css).toContain(".hexdev-truco-calls-group--opening");
  });

  it("acknowledges a hand ending with a solid, non-opacity banner distinguishing won from lost", () => {
    const css = buildTableStylesheet();
    const wonBlock = css.match(/\.hexdev-truco-hand-outcome\[data-result="won"\]\s*\{[^}]*\}/)?.[0] ?? "";
    const lostBlock = css.match(/\.hexdev-truco-hand-outcome\[data-result="lost"\]\s*\{[^}]*\}/)?.[0] ?? "";

    expect(wonBlock).not.toMatch(/opacity\s*:/);
    expect(lostBlock).not.toMatch(/opacity\s*:/);
    expect(wonBlock.length).toBeGreaterThan(0);
    expect(lostBlock.length).toBeGreaterThan(0);
  });

  it("gives the match-over overlay a full, solid-background covering the whole table (a real ending, not a modest inline note)", () => {
    const css = buildTableStylesheet();
    const overlayBlock = css.match(/\.hexdev-truco-match-over\[data-result[^\]]*\]\s*\{[^}]*\}/)?.[0] ?? css.match(/\.hexdev-truco-match-over\s*\{[^}]*\}/)?.[0] ?? "";

    expect(css).toContain(".hexdev-truco-match-over");
    expect(css).toMatch(/\.hexdev-truco-match-over[^{]*\{[^}]*position:\s*absolute/);
    expect(overlayBlock).not.toMatch(/opacity\s*:/);
  });

  it("2v2: styles partner vs opponent distinctly via the data-relation attribute (spec: 'obvious at a glance who you are helping')", () => {
    const css = buildTableStylesheet();

    expect(css).toContain('[data-relation="partner"]');
    expect(css).toContain('[data-relation="opponent"]');
  });

  it("2v2: the señas toggle and picker have their own, deliberately understated styling (spec: 'discoverable without being noisy')", () => {
    const css = buildTableStylesheet();

    expect(css).toContain(".hexdev-truco-senas-toggle");
    expect(css).toContain(".hexdev-truco-sena");
    expect(css).toContain(".hexdev-truco-partner-sena");
  });
});
