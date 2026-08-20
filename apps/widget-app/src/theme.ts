import { describeThemeContrastViolation, sanitizeThemeOverride, THEME_TOKEN_NAMES, validateThemeContrast, type ThemeOverride } from "@hexdev/widget-protocol";

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
 * actually matters.
 *
 * PRECEDENCE, unchanged in what it produces: the second, host-page call wins
 * per-token over the first, tenant-theme call, and any token the host page
 * never mentions keeps whatever the first call already set. What changed is
 * HOW — this function reads the tokens already on the element and merges the
 * incoming theme over them, rather than relying on "only ever set a property
 * for a token present in `theme`" to leave the rest alone. Both produce the
 * same per-token precedence; only the merged form can be validated as a whole.
 * See `theme.browser.test.ts`'s dedicated precedence tests for the full
 * argument on why host-wins is the right rule.
 *
 * CONTRAST, at the same point of use and for the same reason (Tanda 3, WCAG
 * 2.x SC 1.4.3). `validateThemeContrast` runs here as well as at the server's
 * own repository construction, because "validated once, upstream" is exactly
 * the property this function already refuses to trust about shape — and the
 * host-page path never touches that server hop at all, so for the SECONDARY
 * theme this is the only check there is.
 *
 * WHY THE MERGE LIVES HERE AND NOT IN `main.ts`. Validating a complete theme
 * needs the two sources in one object, and the obvious fix — merge them in
 * `main.ts`, call this once — cannot be done without breaking a property that
 * file argues for explicitly: the tenant's server-delivered theme applies the
 * moment it is readable, with ZERO loader involvement, so a tenant with a
 * configured theme still renders themed even when a stale or misbehaving
 * loader never sends `host-hello` at all. The two calls are not sequential
 * statements — the second one lives inside the handshake CALLBACK, and
 * deferring the first to join it would mean no theme at all whenever that
 * callback never fires. So the merge happens against the element, which is
 * the one place both sources are guaranteed to meet no matter which of them
 * arrives, or fails to. This function is also the sole writer of inline
 * `--gx-*` properties on that element (the shell's own fallback is a
 * stylesheet rule, `embed-shell.ts`), so reading them back is reading only
 * what this function itself last wrote.
 *
 * RECONCILE, don't just write: a dropped token is REMOVED from the element,
 * not merely skipped. A host override that makes an already-applied tenant
 * value illegible has to be able to take that value off the element, or the
 * drop would be silent and the illegible pairing would still render.
 *
 * WARN, NEVER THROW. The server may fail loud at boot; this may not. A
 * player is mid-match behind this call, and no colour is worth ending their
 * session over — the theme is already correct by the time the warning is
 * logged, so it costs the player nothing while still leaving the integrator
 * a trace of why their brand did not appear.
 */
export function applyThemeToRoot(root: HTMLElement, theme: Readonly<Record<string, string>> | undefined): void {
  const applied: ThemeOverride = {};
  for (const name of THEME_TOKEN_NAMES) {
    const current = root.style.getPropertyValue(name);
    if (current !== "") applied[name] = current;
  }
  // The INCOMING theme is sanitized BEFORE the merge, never after it: merging
  // raw would let a shape-invalid value enter, be dropped, and then be REMOVED
  // from the element by the reconcile loop below, erasing a good value an
  // earlier call applied — a host-page typo must not wipe a tenant's brand.
  // `applied` needs no re-sanitizing; it is only ever what this function wrote.
  const validated = validateThemeContrast({ ...applied, ...sanitizeThemeOverride(theme ?? {}) });
  for (const violation of validated.violations) {
    console.warn(`applyThemeToRoot: ${describeThemeContrastViolation(violation)}`);
  }
  for (const name of THEME_TOKEN_NAMES) {
    const value = validated.theme[name];
    if (value === undefined) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }
}
