import { describe, expect, it } from "vitest";
import { buildTableStylesheet } from "@hexdev/truco-ui";
import { buildChromeStylesheet } from "./chrome-styles.js";

/**
 * VDS-1 (design token layer): the private --hx-* token set (spacing,
 * radii, elevation, type, motion, colour — design §10.3) is declared TWICE
 * -- once on table-styles.ts's :root (the matchstick <defs>-sibling
 * scoping constraint forces :root there), once on chrome-styles.ts's own
 * .hexdev-gamify-chrome (ordinary descendant scoping, no sibling problem).
 * Two independent literal declarations only stay a single source of truth
 * if something keeps them honest -- this file is that something: it fails
 * the moment either stylesheet drops a token or drifts its value from the
 * other.
 *
 * RED-first (PR1-T1): authored and run BEFORE table-styles.ts/chrome-
 * styles.ts declared any --hx-* token. `pnpm exec vitest run
 * design-token-parity.test.ts` failed at that point -- every "declares
 * every expected token" assertion below failed, since both extracted
 * maps were empty (no --hx-* declaration existed in either block yet).
 * PR1-T2/T3 then declared the tokens, turning this GREEN (PR1-T4).
 */

// Every --hx-* token this PR's layer declares (tasks §3.1-3.6). An explicit
// list, not just "the map is non-empty": dropping any single token, not
// only total drift, must fail this test, and the list itself is what keeps
// this suite from passing vacuously before PR1-T2/T3 land.
const EXPECTED_HX_TOKEN_NAMES = [
  // spacing (§3.1)
  "--hx-space-2xs",
  "--hx-space-xs",
  "--hx-space-sm",
  "--hx-space-md",
  "--hx-space-lg",
  "--hx-space-xl",
  "--hx-space-2xl",
  // radii (§3.2)
  "--hx-radius-sm",
  "--hx-radius-md",
  "--hx-radius-lg",
  "--hx-radius-xl",
  "--hx-radius-pill",
  // elevation (§3.3)
  "--hx-elev-1",
  "--hx-elev-2",
  "--hx-elev-3",
  "--hx-elev-4",
  "--hx-relief",
  "--hx-rim",
  // type (§3.4)
  "--hx-text-display",
  "--hx-text-display-compact",
  "--hx-text-title",
  "--hx-text-body",
  "--hx-text-meta",
  "--hx-text-label",
  "--hx-tracking-label",
  "--hx-leading",
  // motion (§3.5)
  "--hx-motion-fast",
  "--hx-ease",
  // private colour (§3.6)
  "--hx-chrome-on-felt",
  "--hx-gold",
  "--hx-gold-edge",
  "--hx-ink",
  // Tanda 3: the felt's own text colour, private for the same reason
  // --hx-gold is (see table-styles.ts's declaration for the full argument).
  // Mirrored into chrome-styles.ts for parity even though no chrome rule
  // reads it, exactly as --hx-leading is mirrored the other way.
  "--hx-felt-text",
  // Tanda 4: the BORDER colour of the felt's outlined controls, private for
  // the same cross-zone reason --hx-felt-text is, and additionally bound to
  // WCAG 1.4.11's 3:1 floor (felt-outline-contrast.browser.test.ts). Mirrored
  // into chrome-styles.ts unread, exactly like --hx-felt-text.
  "--hx-felt-outline",
] as const;

function extractDeclarationBlock(css: string, selectorPattern: RegExp): string {
  return css.match(selectorPattern)?.[1] ?? "";
}

function extractHxTokens(declarationBlock: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const declarationPattern = /(--hx-[a-z0-9-]+)\s*:\s*([^;]+);/g;
  for (const match of declarationBlock.matchAll(declarationPattern)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) tokens[name] = value.trim();
  }
  return tokens;
}

function tableRootTokens(): Record<string, string> {
  return extractHxTokens(extractDeclarationBlock(buildTableStylesheet(), /:root\s*\{([^}]*)\}/));
}

function chromeSurfaceTokens(): Record<string, string> {
  return extractHxTokens(extractDeclarationBlock(buildChromeStylesheet(), /\.hexdev-gamify-chrome\s*\{([^}]*)\}/));
}

describe("design-token-parity (VDS-1: the --hx-* token layer is identical in both stylesheets)", () => {
  it("declares every expected --hx-* token in table-styles.ts's :root block", () => {
    const rootTokens = tableRootTokens();

    for (const name of EXPECTED_HX_TOKEN_NAMES) {
      expect(rootTokens[name], `table-styles.ts :root is missing ${name}`).toBeDefined();
    }
  });

  it("declares every expected --hx-* token in chrome-styles.ts's .hexdev-gamify-chrome block", () => {
    const chromeTokens = chromeSurfaceTokens();

    for (const name of EXPECTED_HX_TOKEN_NAMES) {
      expect(chromeTokens[name], `chrome-styles.ts .hexdev-gamify-chrome is missing ${name}`).toBeDefined();
    }
  });

  it("gives every --hx-* token an identical value in both stylesheets", () => {
    const rootTokens = tableRootTokens();
    const chromeTokens = chromeSurfaceTokens();

    for (const name of EXPECTED_HX_TOKEN_NAMES) {
      expect(chromeTokens[name], `${name} drifted between table-styles.ts and chrome-styles.ts`).toBe(rootTokens[name]);
    }
  });
});
