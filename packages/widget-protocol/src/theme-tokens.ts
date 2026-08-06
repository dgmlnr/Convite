/**
 * Host-supplied theme overrides (design §10, secondary path). The primary
 * theming path is server-delivered and never touches this file at all — a
 * tenant's brand tokens come back in the `/embed` bootstrap payload and are
 * applied by `widget-app` directly, with zero loader involvement.
 *
 * This module exists ONLY for the optional secondary path: a host page may
 * offer `data-theme-*` attributes on the `<script>` tag, which the loader
 * forwards in `host-hello`. Accepting an arbitrary CSS string from a host
 * page would be a CSS-injection vector into our own document, so the
 * vocabulary is CLOSED (only these exact keys are ever read out of the
 * input, everything else is structurally invisible to the sanitizer) and
 * every value is regex-validated against its token's own shape.
 */
export const THEME_TOKEN_NAMES = [
  "--gx-color-surface",
  "--gx-color-on-surface",
  "--gx-color-primary",
  "--gx-color-on-primary",
  "--gx-color-accent",
  "--gx-radius",
  "--gx-font-family",
] as const;

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];

export type ThemeOverride = Partial<Record<ThemeTokenName, string>>;

// Hex, rgb()/rgba(), hsl()/hsla() — no url(), no calc(), no `;`, no `{`.
const COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$|^(rgb|hsl)a?\([\d.\s,%]+\)$/;

// A plain CSS length: a number followed by one known unit.
const LENGTH_PATTERN = /^\d+(\.\d+)?(px|rem|em|%)$/;

// A font-family list: letters, digits, spaces, hyphens, commas and quotes
// only — no `url(`, no `;`, no braces, so it cannot close out of the
// declaration it will be assigned into.
const FONT_FAMILY_PATTERN = /^[a-zA-Z0-9\s\-,'"]{1,120}$/;

const TOKEN_PATTERNS: Record<ThemeTokenName, RegExp> = {
  "--gx-color-surface": COLOR_PATTERN,
  "--gx-color-on-surface": COLOR_PATTERN,
  "--gx-color-primary": COLOR_PATTERN,
  "--gx-color-on-primary": COLOR_PATTERN,
  "--gx-color-accent": COLOR_PATTERN,
  "--gx-radius": LENGTH_PATTERN,
  "--gx-font-family": FONT_FAMILY_PATTERN,
};

/**
 * Reads ONLY the closed token vocabulary out of an arbitrary input object,
 * dropping any key not in `THEME_TOKEN_NAMES` and any value that fails its
 * own token's pattern. The loop is driven by the vocabulary, not by the
 * input's own keys, so a prototype-pollution-shaped or otherwise unexpected
 * key can never end up in the result no matter what it is named.
 */
export function sanitizeThemeOverride(input: Readonly<Record<string, unknown>>): ThemeOverride {
  const result: ThemeOverride = {};
  for (const name of THEME_TOKEN_NAMES) {
    const raw = input[name];
    if (typeof raw !== "string") continue;
    if (!TOKEN_PATTERNS[name].test(raw)) continue;
    result[name] = raw;
  }
  return result;
}
