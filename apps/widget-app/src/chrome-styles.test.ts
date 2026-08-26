import { describe, expect, it } from "vitest";
import { ACCENT_INK } from "@hexdev/widget-protocol";
import { CHROME_STYLE_ID, buildChromeStylesheet } from "./chrome-styles.js";


/**
 * THE STYLESHEET CLOSES EVERY BLOCK IT OPENS.
 *
 * Trivial to check and worth checking, because of how this fails: an unclosed
 * brace does not throw, does not warn, and does not break the rules ABOVE it.
 * Everything after it is silently swallowed into the open block and simply
 * stops applying. It shipped exactly once — a rule edit dropped a closing
 * brace and every declaration in the last third of the file quietly stopped
 * existing, which surfaced as one unrelated test seeing "line-height: normal"
 * on an element whose rule was still right there in the source.
 *
 * These are template literals built by hand, so no CSS parser ever sees them
 * before a browser does. This is the parser.
 */
function braceBalance(css: string): number {
  let depth = 0;
  for (const character of css) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
  }
  return depth;
}

describe("buildChromeStylesheet (design §10: hybrid theming by zone — the lobby/selection screen is CHROME, so it takes the tenant's brand)", () => {
  /**
   * THE LINE MOVED, and this fence moved with it rather than being deleted.
   *
   * It used to read "every visible surface comes from the tenant's tokens",
   * which was the old answer to a real question: whose identity is the lobby?
   * The answer changed on purpose. A tenant with a white page produced a white
   * lobby — a tidy FORM, never a table — and quality any embedder can dissolve
   * is not quality.
   *
   * So the contract is now SPECIFIC instead of total, and that is what this
   * asserts: the SURFACE is ours and the tenant only tints it, while every
   * CONTROL still takes their brand. Both halves are load-bearing. Drop the
   * first and an embedder can wash the product out; drop the second and we
   * have quietly stopped being themeable at all, which is the thing this
   * widget is sold on.
   */
  it("keeps the surface ours and the controls theirs", () => {
    const css = buildChromeStylesheet();

    // OURS: the felt is the base, and --gx-color-surface may only tint it.
    expect(css, "the chrome surface stopped being the cloth").toMatch(/\.convite-chrome\s*\{[^}]*var\(--hx-cloth\)/);
    expect(css, "the tenant paints the surface again instead of tinting it").toMatch(/color-mix\([^)]*var\(--gx-color-surface[^)]*\)\s*var\(--hx-felt-tint\)/);

    // THEIRS: radius, accent and primary still reach the controls.
    expect(css, "the game card stopped honouring the tenant radius").toMatch(/\.hexdev-game-card[^}]*var\(--gx-radius/);
    expect(css, "the prominent CTA stopped honouring the tenant accent").toMatch(/var\(--gx-color-accent/);
    expect(css, "the tenant primary no longer tints the controls").toMatch(/var\(--gx-color-primary/);
  });

  it("never references a truco-only token (--truco-*/--deck-*) — chrome must stay generic for any future game", () => {
    const css = buildChromeStylesheet();

    expect(css).not.toMatch(/--truco-/);
    expect(css).not.toMatch(/--deck-/);
  });

  it("closes every block it opens", () => {
    expect(braceBalance(buildChromeStylesheet()), "an unclosed block is silently swallowing every rule after it").toBe(0);
  });

  it("never leaves a stray closing brace either — that ends the stylesheet early", () => {
    // The mirror failure: one } too many terminates the sheet where a browser
    // stops caring, and again nothing throws.
    let depth = 0;
    for (const character of buildChromeStylesheet()) {
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      if (depth < 0) break;
    }
    expect(depth).toBeGreaterThanOrEqual(0);
  });

  it("exposes a stable element id for idempotent injection", () => {
    expect(CHROME_STYLE_ID).toBe("convite-chrome-styles");
  });

  it("gives the promoted vs-bot CTA a stronger visual treatment than the plain vs-person action (zero-counter UX rule)", () => {
    const css = buildChromeStylesheet();

    expect(css).toMatch(/\[data-prominent="bot"\]/);
  });
});

// PR6-T6 guard, mirroring PR3-T5/T6's own pattern in table-styles.test.ts
// (tasks §10). Deliberately COPIED here, not imported: the two packages do
// not share test utilities (truco-ui has no dependency on this app, and vice
// versa), the same boundary PR1-T5's own deviation note already established.
//
// A naive `/selector\s*\{[^}]*\}/` single-pass scan is unsafe for the
// selectors below for the exact reason table-styles.test.ts's own comment
// documents: `.convite-chrome button[data-action="retry"]`'s tail is
// byte-identical to `.convite-chrome button`'s own opening, so a naive
// scan would find the wrong (shorter, earlier) rule first. This stylesheet
// also nests real rules inside `@container` blocks (PR6-T1/T2's own
// .hexdev-chrome-games and .convite-chrome overrides), which a
// single-pass regex cannot see at all — `collectLeafRules` below is the
// balanced-brace walk PR4's native-review fix introduced in table-styles.ts,
// copied verbatim (not reinvented) for the same reason.
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

interface LeafRule {
  readonly selectorList: string;
  readonly body: string;
}

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

// The 4 chrome surfaces PR6 newly styled with elevation/radius (tasks
// §10, PR6-T6): the lobby card, the modality block, and the shared
// status/error card (renderStatusMessage and renderErrorWithRetry both set
// `className = "hexdev-chrome-status"` — one selector, two screens, see
// status-view.ts).
const CHROME_STYLED_SURFACES = [".hexdev-game-card", ".hexdev-modality", ".hexdev-chrome-status"] as const;

describe("VDS-2/WCR-3 (PR6-T6): the newly styled chrome surfaces stay on the tenant's --gx- tokens", () => {
  it.each(CHROME_STYLED_SURFACES)("%s reads at least one --gx- token somewhere in its own rule(s)", (selector) => {
    const css = buildChromeStylesheet();
    const ownBody = ruleBodyForExactSelector(css, selector);

    expect(ownBody.length, `no rule found for exact selector ${selector}`).toBeGreaterThan(0);
    expect(ownBody).toMatch(/--gx-/);
  });

  // Mirrors PR3-T5's "every --gx- read carries a fallback" — same closed
  // vocabulary, same bare-read regex, this file's own stylesheet instead of
  // table-styles.ts's.
  it("every --gx- read carries a fallback", () => {
    const css = buildChromeStylesheet();
    const bareReads = css.match(/var\(--gx-[a-z-]+\)/g) ?? [];

    expect(bareReads, `bare (no-fallback) --gx- reads found: ${JSON.stringify(bareReads)}`).toEqual([]);
  });
});

describe("ACCENT_INK drift fence (Tanda 3): widget-protocol validates accent against a literal it does not own", () => {
  // `validateThemeContrast` rejects a tenant accent by measuring it against
  // `ACCENT_INK`, a constant in an L0 package that cannot see a stylesheet.
  // If this stylesheet's own `--hx-ink` drifted away from that value, the
  // guard would keep passing while measuring a pairing that no longer
  // renders — the worst failure mode a guard has, because it stays green.
  //
  // This is one of TWO links: `design-token-parity.test.ts` pins
  // table-styles.ts's identical `--hx-ink` to this one, so the felt's copy is
  // covered transitively. truco-ui deliberately has no dependency on
  // @hexdev/widget-protocol (see theme-tokens.test.ts's VDS-1 guard), which
  // is why the chain runs through here rather than straight from there.
  it("declares --hx-ink as exactly the ink widget-protocol validates tenant accents against", () => {
    const css = buildChromeStylesheet();

    expect(css).toMatch(new RegExp(`--hx-ink:\\s*${ACCENT_INK};`));
  });

  // Reads the TOKEN, not the literal, and the chain is what makes that
  // stronger rather than looser: the test directly above proves
  // `--hx-ink` IS `ACCENT_INK`, so matching `var(--hx-ink)` here proves the
  // CTA carries the exact ink widget-protocol validates tenant accents
  // against — through one source instead of two copies that can drift.
  it("paints that same ink on the prominent lobby CTA, the accent-backed surface the audit measured at 1.37:1", () => {
    const css = buildChromeStylesheet();

    expect(css).toMatch(/background: var\(--gx-color-accent[^}]*color: var\(--hx-ink\);/);
  });
});
