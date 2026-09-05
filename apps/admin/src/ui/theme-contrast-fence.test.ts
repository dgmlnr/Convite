import { describe, expect, it } from "vitest";
import { AA_NORMAL_TEXT_CONTRAST, contrastRatio, DEFAULT_THEME_TOKENS, type ThemeTokenName } from "@hexdev/widget-protocol";

/**
 * THE FENCE `validateThemeContrast` DOES NOT PROVIDE (slice 14/15 carry-over
 * debt, disclosed rather than left implicit). That function validates a
 * TENANT'S OWN theme override against a closed set of tenant-facing pairings
 * (`CONTRAST_RULES` in `widget-protocol/theme-tokens.ts`: on-surface/surface,
 * on-primary/primary, accent/ink, accent/surface) — it never runs against
 * `DEFAULT_THEME_TOKENS` itself, and it has no opinion at all about which
 * bridged shadcn variable THIS PANEL'S OWN components choose to paint text on
 * top of. The fence exists; it was looking the other way.
 *
 * The real bug this inherits: `AppShell.tsx`/`TenantListScreen.tsx`/
 * `LoginScreen.tsx` originally painted `text-foreground` (bridged to
 * `--gx-color-on-surface`, `#1a1a1a`) on `bg-background` (`--gx-color-surface`,
 * `#14231d`) — the on-surface/surface pair, measuring ~1.07:1. That pair IS
 * one of `validateThemeContrast`'s four rules, but the function was never
 * ONCE called against the DEFAULT tokens those three components render with
 * no tenant override in play at all — it only ever runs against a tenant's
 * OWN theme payload, at write time (design §2.3, decision #3684 item 4). The
 * fix (slice 14) swapped the class to `text-primary-foreground` locally,
 * component by component; `DEFAULT_THEME_TOKENS` itself was left untouched
 * (correctly — it is not wrong on its own terms, see that constant's own
 * docstring), which means nothing stops a FUTURE component from reaching for
 * `text-foreground` on `bg-background` again and silently reproducing the
 * exact same invisible-text bug, unit tests green throughout (every existing
 * unit test passed straight through the original bug too — it was caught
 * only by looking at a screenshot).
 *
 * This is that missing fence: every gx-bridged foreground/background pair
 * this panel's OWN components actually render together (`theme-bridge.css`'s
 * own shadcn-variable-to-gx-token mapping is the translation), checked with
 * the SAME `contrastRatio` function the tenant-facing validator already uses,
 * against the REAL `DEFAULT_THEME_TOKENS` values — never a tenant override,
 * because this panel renders its OWN chrome with no tenant theme applied to
 * it at all.
 *
 * HAND-MAINTAINED, NOT SOURCE-SCANNED, deliberately proportionate (a focused
 * test, not a new subsystem): "which two Tailwind classes land in the same
 * `className` string" is a far fuzzier signal to scan mechanically than the
 * small, stable set of pairings this panel actually renders. `widget-protocol`'s
 * own `CONTRAST_RULES` makes the identical tradeoff for the tenant-facing
 * side. ADD A ROW HERE whenever a new component pairs a `text-*` class with a
 * `bg-*` class that traces back to a `--gx-*` token.
 */
const ADMIN_RENDERED_PAIRS: readonly { readonly name: string; readonly foreground: ThemeTokenName; readonly background: ThemeTokenName }[] = [
  // LoginScreen.tsx / AppShell.tsx / TenantListScreen.tsx body copy:
  // `text-primary-foreground` on `bg-background`.
  { name: "body copy on the page background", foreground: "--gx-color-on-primary", background: "--gx-color-surface" },
  // Button (default variant) and the "active" status badge:
  // `text-primary-foreground` on `bg-primary`.
  { name: "button and active-status badge text on the primary chip", foreground: "--gx-color-on-primary", background: "--gx-color-primary" },
];

describe("the admin panel's own rendered chrome meets AA contrast against DEFAULT_THEME_TOKENS", () => {
  it.each(ADMIN_RENDERED_PAIRS)("$name", ({ foreground, background }) => {
    const ratio = contrastRatio(DEFAULT_THEME_TOKENS[foreground], DEFAULT_THEME_TOKENS[background]);
    expect(ratio).toBeDefined();
    expect(ratio!).toBeGreaterThanOrEqual(AA_NORMAL_TEXT_CONTRAST);
  });

  /**
   * PROVES THE FENCE ACTUALLY FIRES — the exact regression slice 14 found and
   * fixed, run permanently forward so nobody has to re-discover it by
   * screenshot a second time. Confirmed genuinely RED during this task's own
   * implementation by temporarily adding this exact pair to
   * `ADMIN_RENDERED_PAIRS` above (as a real, non-`skip`ped case) and watching
   * the "meets AA contrast" assertion fail for real
   * (`expected 1.0673816127725713 to be greater than or equal to 4.5`) before
   * removing it again — this permanent test is what stays.
   */
  it("fails, correctly, for the known-bad on-surface/surface pairing this slice's own predecessor fixed", () => {
    const ratio = contrastRatio(DEFAULT_THEME_TOKENS["--gx-color-on-surface"], DEFAULT_THEME_TOKENS["--gx-color-surface"]);
    expect(ratio).toBeDefined();
    expect(ratio!).toBeLessThan(AA_NORMAL_TEXT_CONTRAST);
  });
});
