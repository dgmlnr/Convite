import { sanitizeThemeOverride, THEME_TOKEN_NAMES } from "@hexdev/widget-protocol";

/**
 * Applies the closed, regex-validated theme token vocabulary to the given
 * root element's inline style (design §10: "hybrid theming by zone" — chrome,
 * lobby, and selection take the tenant's brand; the game table/cards keep
 * their own identity, deliberately outside this vocabulary entirely).
 *
 * Called TWICE by `main.ts`, from two genuinely different origins for the
 * `theme` argument, and both re-sanitized here regardless:
 * - the PRIMARY path, `bootstrap.theme` — already sanitized once at
 *   `createStaticTenantRepository` construction (server-side, `tenant-auth.ts`);
 * - the SECONDARY path, `host-hello`'s payload — already sanitized once by
 *   the loader (`widget-config.ts`'s `readLoaderConfig`).
 *
 * Neither "sanitized once, upstream" is trusted blindly here: this iframe's
 * own document must never write CSS from a value it did not itself validate,
 * regardless of how many times an earlier hop already checked it.
 * Re-running `sanitizeThemeOverride` here is cheap and turns "sanitized once,
 * upstream" into "sanitized at the point of use", which is the property that
 * actually matters. Because this function only ever sets a property for a
 * token PRESENT in `theme`, calling it a second time with the host-page
 * override is also the entire precedence mechanism: the second, host-page
 * call wins per-token over the first, tenant-theme call, and any token the
 * host page never mentions keeps whatever the first call already set — see
 * `main.ts`'s own call sites and `theme.browser.test.ts`'s dedicated
 * precedence-rule tests for the full argument.
 */
export function applyThemeToRoot(root: HTMLElement, theme: Readonly<Record<string, string>> | undefined): void {
  const sanitized = sanitizeThemeOverride(theme ?? {});
  for (const name of THEME_TOKEN_NAMES) {
    const value = sanitized[name];
    if (value !== undefined) root.style.setProperty(name, value);
  }
}
