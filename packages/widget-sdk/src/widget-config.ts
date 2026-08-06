import { sanitizeThemeOverride, THEME_TOKEN_NAMES, type TargetOrigin, type ThemeOverride } from "@hexdev/widget-protocol";

/**
 * The minimal structural shape this module needs from the tenant's
 * `<script>` tag. NOT `HTMLScriptElement` — reading attributes never needs a
 * real DOM, so this file stays Node-testable with a plain object double,
 * same convention as `widget-protocol`'s `MessageTarget`.
 */
export interface ScriptTagLike {
  getAttribute(name: string): string | null;
}

export interface LoaderConfig {
  readonly embedKey: string;
  readonly themeOverride: ThemeOverride;
}

// `--gx-color-primary` -> `data-theme-color-primary`. One mechanical rule,
// derived from the closed vocabulary itself so a new token never needs a
// second place updated.
function themeAttributeName(tokenName: string): string {
  return `data-theme-${tokenName.replace(/^--gx-/, "")}`;
}

/**
 * Reads the loader's entire configuration off the tenant's own `<script>`
 * tag — no other input exists (design §7's whole point: the tag IS the
 * integration surface). Returns `null` when the one required attribute,
 * `data-embed-key`, is missing or blank, since nothing useful can be
 * mounted without it.
 */
export function readLoaderConfig(scriptTag: ScriptTagLike): LoaderConfig | null {
  const embedKey = scriptTag.getAttribute("data-embed-key")?.trim();
  if (embedKey === undefined || embedKey === "") return null;

  const rawTheme: Record<string, unknown> = {};
  for (const tokenName of THEME_TOKEN_NAMES) {
    const value = scriptTag.getAttribute(themeAttributeName(tokenName));
    if (value !== null) rawTheme[tokenName] = value;
  }

  return { embedKey, themeOverride: sanitizeThemeOverride(rawTheme) };
}

/**
 * Builds the iframe's `src` (design §7): `k` identifies the tenant, `o` is
 * the host origin the server will check against that tenant's allowlist —
 * both at `/embed` load time and again at room-join time.
 */
export function buildEmbedUrl(widgetOrigin: TargetOrigin, config: LoaderConfig, hostOrigin: string): string {
  const url = new URL("/embed", widgetOrigin);
  url.searchParams.set("k", config.embedKey);
  url.searchParams.set("o", hostOrigin);
  return url.toString();
}
