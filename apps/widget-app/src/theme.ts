import { sanitizeThemeOverride, THEME_TOKEN_NAMES } from "@hexdev/widget-protocol";

/**
 * Applies the closed, regex-validated theme token vocabulary to the given
 * root element's inline style (design §10: "hybrid theming by zone" — chrome,
 * lobby, and selection take the tenant's brand; the game table/cards keep
 * their own identity, deliberately outside this vocabulary entirely).
 *
 * The theme argument arrives here over `postMessage` (`host-hello`'s
 * payload) from the loader, which already sanitized it once
 * (`widget-config.ts`'s `readLoaderConfig`) — but this iframe's own document
 * must never trust a message from its parent blindly for something that
 * writes CSS. Re-running `sanitizeThemeOverride` here is cheap and turns
 * "sanitized once, upstream" into "sanitized at the point of use", which is
 * the property that actually matters.
 */
export function applyThemeToRoot(root: HTMLElement, theme: Readonly<Record<string, string>> | undefined): void {
  const sanitized = sanitizeThemeOverride(theme ?? {});
  for (const name of THEME_TOKEN_NAMES) {
    const value = sanitized[name];
    if (value !== undefined) root.style.setProperty(name, value);
  }
}
