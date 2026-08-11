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

  // PR3-T5 (tasks §7, VDS-2 guard half): a `var(--gx-*)` read with NO
  // fallback breaks the very first time a tenant sends no theme at all — the
  // fallback IS what keeps this file's own "hybrid theming by zone" promise
  // (design §10 docblock above) honest for every `--gx-*` token, not just
  // the ones a reviewer happens to eyeball. `[a-z-]+\)` (closing paren
  // immediately after the token name, no comma) only matches a BARE read —
  // any read with a fallback has a `,` right there instead of `)`, so it can
  // never false-positive against the (currently universal) `var(--gx-x, y)`
  // shape already in this file.
  it("every --gx- read carries a fallback", () => {
    const css = buildTableStylesheet();
    const bareReads = css.match(/var\(--gx-[a-z-]+\)/g) ?? [];

    expect(bareReads, `bare (no-fallback) --gx- reads found: ${JSON.stringify(bareReads)}`).toEqual([]);
  });
});

// PR3-T6 (tasks §7, VDS-2's own "unit assertion catches a hardcoded chrome
// color" scenario). A naive `/selector\s*\{[^}]*\}/` scan (this file's own
// convention for several OTHER single-selector guards above) is not safe
// for the selectors below: this stylesheet has real rules like
// `.hexdev-truco-shell-layout > .hexdev-truco-table { flex: 1 1 auto; }`,
// whose tail is byte-identical to `.hexdev-truco-table`'s own base rule
// opening — a naive scan finds THAT tiny compound rule first (wrong rule,
// no `--gx-`/`--truco-cloth` in it at all) instead of the real ~40-line
// felt rule below it. `stripComments` + `ruleBodyForExactSelector` avoid
// this two ways: comments are removed first (an unstripped comment
// immediately before a rule was, empirically, swallowed into the "selector"
// capture and broke an exact-string match), and a rule only counts if
// `exactSelector` appears as a COMPLETE, comma-separated entry in that
// rule's own selector list — never as the tail of a combinator/compound
// chain. Several of the 9 surfaces below also have MORE than one rule
// targeting the bare selector (e.g. `.hexdev-truco-scoreboard-panel` also
// gets a layout-only variant inside the medium-tier `@container` block,
// which carries no color at all) — this helper collects every one of those,
// not just the first, so checking only the first found could not silently
// pass or fail depending on source order.
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function ruleBodyForExactSelector(css: string, exactSelector: string): string {
  const ruleRegex = /([^{}]+)\{([^}]*)\}/g;
  const bodies: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = ruleRegex.exec(stripComments(css))) !== null) {
    const selectors = match[1]!.split(",").map((entry) => entry.trim());
    if (selectors.includes(exactSelector)) bodies.push(match[2]!);
  }
  return bodies.join("\n");
}

// The exact 9 felt-mounted CHROME surfaces (tasks §7): every one of these
// sits physically on top of the felt (a scoreboard panel, a call log, calls,
// the pending-call banner, the turn badge, señas, the match-over overlay,
// the hand-outcome chip) but is still CHROME by design §10's own hybrid
// theming rule — a tenant's brand must reach it, unlike the felt/cards
// beneath it.
const CHROME_SURFACES_ON_FELT = [
  ".hexdev-truco-scoreboard-panel",
  ".hexdev-truco-call-log",
  ".hexdev-truco-call",
  ".hexdev-truco-pending-call",
  ".hexdev-truco-turn-badge",
  ".hexdev-truco-senas-toggle",
  ".hexdev-truco-sena",
  ".hexdev-truco-match-over",
  ".hexdev-truco-hand-outcome",
] as const;

describe("VDS-2 (design §10, hybrid theming by zone): chrome-on-felt surfaces read the tenant's --gx- tokens, the felt itself never does", () => {
  it.each(CHROME_SURFACES_ON_FELT)("%s reads at least one --gx- token somewhere in its own rule(s)", (selector) => {
    const css = buildTableStylesheet();
    const ownBody = ruleBodyForExactSelector(css, selector);

    expect(ownBody.length, `no rule found for exact selector ${selector}`).toBeGreaterThan(0);
    expect(ownBody).toMatch(/--gx-/);
  });

  it("the felt's own background is never a tenant token", () => {
    const css = buildTableStylesheet();
    const feltBody = ruleBodyForExactSelector(css, ".hexdev-truco-table");
    const backgroundDeclaration = feltBody.match(/background:\s*[\s\S]*?;/)?.[0] ?? "";

    expect(feltBody.length, "no rule found for exact selector .hexdev-truco-table").toBeGreaterThan(0);
    expect(backgroundDeclaration.length, "no background declaration found on .hexdev-truco-table").toBeGreaterThan(0);
    expect(backgroundDeclaration).toContain("--truco-cloth");
    expect(backgroundDeclaration).not.toMatch(/--gx-/);
  });
});
