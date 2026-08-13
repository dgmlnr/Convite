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

  // The chip lives on the cloth for about two seconds, which is exactly when
  // an `opacity` dim would be least forgivable: it would tint the whole thing
  // toward the felt for the entire time it is readable at all (visual/README:
  // the historical bug this project already shipped once). Same regex-guard
  // shape as the hand-outcome banner's own anti-opacity assertion above.
  it("shows a partner's transient seña on a solid surface, never dimmed toward the felt with opacity", () => {
    const css = buildTableStylesheet();
    const noticeBlock = css.match(/\.hexdev-truco-sena-notice\s*\{[^}]*\}/)?.[0] ?? "";

    expect(noticeBlock.length, "expected a .hexdev-truco-sena-notice rule to exist").toBeGreaterThan(0);
    expect(noticeBlock).toMatch(/background:\s*var\(--gx-color-surface/);
    expect(noticeBlock).not.toMatch(/opacity\s*:/);
    // The lane hides an unoccupied slot the same way the two banners already
    // do — without this the empty div would still take space in the flex row.
    expect(css).toContain(".hexdev-truco-sena-notice:empty");
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
  });

  // The per-hand cap keeps this button on the band instead of removing it, so
  // for the first time it has a real dimmed state — and a dimmed state is
  // exactly where this project's one historical visual bug lives (visual/
  // README.md: opacity over the green cloth tinted the surface instead of
  // dimming it). Same regex-guard shape as the locked-card assertion below.
  it("dims the spent señas toggle with filter, never opacity — and does not leave the hover brighten fighting it", () => {
    const css = buildTableStylesheet();
    const disabledBlock = css.match(/\.hexdev-truco-senas-toggle:disabled\s*\{[^}]*\}/)?.[0] ?? "";

    expect(disabledBlock.length, "expected a .hexdev-truco-senas-toggle:disabled rule to exist").toBeGreaterThan(0);
    expect(disabledBlock).not.toMatch(/opacity\s*:/);
    expect(disabledBlock).toMatch(/filter:\s*brightness\(/);
    // The hover brighten must exclude the disabled button explicitly, rather
    // than relying on source order to out-cascade it.
    expect(css).toMatch(/\.hexdev-truco-senas-toggle:hover:not\(:disabled\)/);
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
//
// PR4 fix (native-review finding on PR3b): the original single-pass
// `/([^{}]+)\{([^}]*)\}/g` scan only ever matched TOP-LEVEL rules — its
// selector-capture group `[^{}]+` and its body-capture group `[^}]*` both
// stop at the first brace they meet, so for a rule nested inside an at-rule
// (`@container ... { .foo { ... } }`) the match's "selector" ends up being
// the at-rule's own prelude (e.g. `@container hexdev-truco-shell
// (min-width: 900px)`) and the inner selector (`.foo`) was never captured
// on its own — `ruleBodyForExactSelector` silently returned `""` for any
// selector whose ONLY rule lived inside an `@container`/`@media` block, even
// though the comment above previously (incorrectly) claimed this helper
// "collects every one of those". `collectLeafRules` below replaces the
// single-pass regex with a small balanced-brace walk: it finds every
// top-level block, and whenever a block's prelude starts with `@` (an
// at-rule) it recurses into that block's own body instead of treating the
// at-rule's prelude as a selector — so a selector's rules are found and
// aggregated regardless of whether they sit at the top level or nested one
// (or more) levels inside an at-rule. See the RED-proof for this fix in
// PR4's apply-progress notes: a synthetic CSS string containing
// `.hexdev-truco-call-log` ONLY inside a nested `@container` block returned
// `""` (RED) under the old implementation and the real matched body (GREEN)
// under this one, while the pre-existing compound-selector false-positive
// case (`.hexdev-truco-shell-layout > .hexdev-truco-table`) stayed correctly
// excluded.
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

interface LeafRule {
  readonly selectorList: string;
  readonly body: string;
}

/** Walks `css` with an explicit brace-depth counter (not a regex) so it can
 * tell an at-rule's prelude (`@container ...`, `@media ...`) apart from a
 * plain selector list, and recurses into an at-rule's own body to collect
 * the leaf rules nested inside it — at any nesting depth, not just one
 * level, since the walk is the same at every depth. */
function collectLeafRules(css: string): readonly LeafRule[] {
  const results: LeafRule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    if (prelude.startsWith("@")) {
      results.push(...collectLeafRules(body));
    } else if (prelude.length > 0) {
      results.push({ selectorList: prelude, body });
    }
    i = j;
  }
  return results;
}

function ruleBodyForExactSelector(css: string, exactSelector: string): string {
  const bodies: string[] = [];
  for (const { selectorList, body } of collectLeafRules(stripComments(css))) {
    const selectors = selectorList.split(",").map((entry) => entry.trim());
    if (selectors.includes(exactSelector)) bodies.push(body);
  }
  return bodies.join("\n");
}

// The exact 10 felt-mounted CHROME surfaces (tasks §7): every one of these
// sits physically on top of the felt (a scoreboard panel, a call log, calls,
// the pending-call banner, the turn badge, señas, the match-over overlay,
// the hand-outcome chip) but is still CHROME by design §10's own hybrid
// theming rule — a tenant's brand must reach it, unlike the felt/cards
// beneath it. FU-1 adds the 10th: the open señas picker became its own
// elevated popover surface (.hexdev-truco-senas-row), so it now has a
// background of its own to get wrong, exactly what this guard is for.
const CHROME_SURFACES_ON_FELT = [
  ".hexdev-truco-scoreboard-panel",
  ".hexdev-truco-call-log",
  ".hexdev-truco-call",
  ".hexdev-truco-pending-call",
  ".hexdev-truco-turn-badge",
  ".hexdev-truco-senas-toggle",
  ".hexdev-truco-senas-row",
  ".hexdev-truco-sena",
  ".hexdev-truco-match-over",
  ".hexdev-truco-hand-outcome",
  // The transient partner-seña notice: the 11th, and the newest chip to sit
  // physically on the cloth with a background of its own to get wrong.
  ".hexdev-truco-sena-notice",
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
