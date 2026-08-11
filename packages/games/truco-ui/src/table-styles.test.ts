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
    expect(css).toContain(".hexdev-truco-relation-label");
  });

  it("2v2: the señas toggle and picker have their own, deliberately understated styling (spec: 'discoverable without being noisy')", () => {
    const css = buildTableStylesheet();

    expect(css).toContain(".hexdev-truco-senas-toggle");
    expect(css).toContain(".hexdev-truco-sena");
    expect(css).toContain(".hexdev-truco-partner-sena");
  });

  // PR2-T4 (VDS-4/design §14 item 3): locked-card readability is the exact
  // historical bug this project already shipped once (visual/README.md:
  // opacity: 0.55 tinted the card green through the felt). filter never
  // blends the surface behind it — this guard makes the anti-opacity
  // discipline mechanically enforced, not just a comment above the rule.
  it("never dims a locked card with opacity — filter only", () => {
    const css = buildTableStylesheet();
    const lockedBlock = css.match(/\.hexdev-truco-card--locked\s*\{[^}]*\}/)?.[0] ?? "";

    expect(lockedBlock.length).toBeGreaterThan(0);
    expect(lockedBlock).not.toMatch(/opacity\s*:/);
    expect(lockedBlock).toMatch(/filter:\s*brightness\(/);
  });

  // PR2-T8 (VDS-5: "Motion Is Restrained and Reduced-Motion Aware"). No test
  // file in the design names this scenario, so it is a gap-filling guard —
  // same regex-assertion pattern as PR2-T4/PR1-T5. The playable card's own
  // hover/focus transition (table-styles.ts) must be fully disabled under
  // prefers-reduced-motion, not merely shortened.
  it("disables the playable card's hover/focus transition under prefers-reduced-motion (VDS-5)", () => {
    const css = buildTableStylesheet();
    const reducedMotionBlock = css.match(/@media \(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\}\s*\}/)?.[0] ?? "";
    const ruleInsideMediaBlock = reducedMotionBlock.match(/\.hexdev-truco-card--playable\s*\{[^}]*\}/)?.[0] ?? "";

    expect(reducedMotionBlock.length, "expected an @media (prefers-reduced-motion: reduce) block to exist").toBeGreaterThan(0);
    expect(ruleInsideMediaBlock).toMatch(/transition:\s*none/);
  });
});
