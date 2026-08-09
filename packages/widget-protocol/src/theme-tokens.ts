/**
 * The closed theme token vocabulary and its sanitizer (design §10), shared
 * by BOTH real theming paths — never duplicated between them:
 *
 * - PRIMARY, server-delivered (`@hexdev/platform-core`'s `tenant-auth.ts`):
 *   a tenant's brand tokens are configured on its `TenantRecord`, sanitized
 *   with THIS SAME function at repository-construction time, and returned
 *   in the `/embed` bootstrap payload. `widget-app` applies them directly
 *   from that payload, with zero loader involvement — the loader script
 *   never sees or forwards them.
 * - SECONDARY, host override (optional): a host page may offer
 *   `data-theme-*` attributes on the `<script>` tag, which the loader
 *   forwards in `host-hello`. Applied on top of the primary theme, and wins
 *   per-token where both set the same one — see `apps/widget-app/src/main.ts`'s
 *   own docstring for the full precedence rule and its justification.
 *
 * Both paths carry deployment/config-adjacent input we do not fully trust:
 * `HEXDEV_TENANTS_JSON` for the primary path, host-page markup for the
 * secondary one. Accepting an arbitrary CSS string from either would be a
 * CSS-injection vector into our own document, so the vocabulary is CLOSED
 * (only these exact keys are ever read out of the input, everything else is
 * structurally invisible to the sanitizer) and every value is
 * regex-validated against its token's own shape.
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
