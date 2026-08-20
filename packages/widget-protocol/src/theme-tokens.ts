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
// The hex alternation lists the four lengths CSS actually defines (3, 4, 6,
// 8) rather than a `{3,8}` range: a 5- or 7-digit value is not a colour, so
// the browser discards the whole declaration and the token silently fails to
// apply. Admitting one only converts a typo into an unexplained missing
// brand, and `validateThemeContrast` cannot measure it either.
const COLOR_PATTERN = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$|^(rgb|hsl)a?\([\d.\s,%]+\)$/;

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

/** WCAG 2.x AA for normal-size text (SC 1.4.3). Large text would allow 3:1,
 * but a tenant token is not scoped to one type size — the same
 * `--gx-color-accent` paints a 0.7rem team label and a 1.5rem headline — so
 * the stricter threshold is the only one that holds everywhere it lands. */
export const AA_NORMAL_TEXT_CONTRAST = 4.5;

/**
 * The FIXED near-black every accent surface paints its own text with,
 * declared as `--hx-ink` in BOTH stylesheets (`table-styles.ts`'s `:root`,
 * `chrome-styles.ts`'s `.hexdev-gamify-chrome`) and once more as a bare
 * literal at `chrome-styles.ts`'s prominent lobby CTA.
 *
 * It is NOT a tenant token and never will be: there is no
 * `--gx-color-on-accent` in the vocabulary at all, so a tenant that picks a
 * dark accent cannot also pick a light ink to survive it. That asymmetry is
 * exactly why `accent/ink` has to be a validated pair — the tenant chooses
 * one half of a pairing whose other half is ours.
 *
 * DRIFT NOTE: `apps/widget-app`'s own `chrome-styles.test.ts` fences its
 * `--hx-ink` declaration against this constant. `truco-ui` deliberately has
 * no dependency on this package (see `theme-tokens.test.ts`'s VDS-1 guard for
 * that argument), so its identical `--hx-ink` is held in step only by
 * `design-token-parity.test.ts`, which pins the two stylesheets to each
 * other. The chain is closed; it is just two links rather than one.
 */
export const ACCENT_INK = "#1a1a1a";

/** sRGB in 0-255, opaque only — a translucent colour has no contrast until
 * something is decided about what is behind it, and nothing here knows that. */
type Srgb = readonly [number, number, number];

function parseHex(value: string): Srgb | undefined {
  const digits = value.slice(1);
  // The same four lengths COLOR_PATTERN admits, checked independently rather
  // than assumed: `contrastRatio` is exported and takes raw strings, so it is
  // reachable with values that never passed the sanitizer at all.
  if (digits.length !== 3 && digits.length !== 4 && digits.length !== 6 && digits.length !== 8) return undefined;
  const short = digits.length <= 4;
  const channel = (index: number): number => {
    const slice = short ? digits[index]!.repeat(2) : digits.slice(index * 2, index * 2 + 2);
    return Number.parseInt(slice, 16);
  };
  const hasAlpha = digits.length === 4 || digits.length === 8;
  if (hasAlpha && channel(3) !== 255) return undefined;
  return [channel(0), channel(1), channel(2)];
}

/** COLOR_PATTERN admits `[\d.\s,%]` inside the parens, so both the legacy
 * comma form and the space-separated modern one arrive here; neither can
 * carry a `/` alpha, a `deg` unit or a negative number. */
function parseFunctionArguments(value: string): readonly string[] {
  return value
    .slice(value.indexOf("(") + 1, -1)
    .split(/[\s,]+/)
    .filter((part) => part !== "");
}

function toNumber(part: string, percentScale: number): number {
  return part.endsWith("%") ? (Number(part.slice(0, -1)) / 100) * percentScale : Number(part);
}

function hslChannels(hue: number, saturation: number, lightness: number): Srgb {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = (((hue % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const base: readonly number[] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ][Math.floor(sector) % 6]!;
  const offset = lightness - chroma / 2;
  return [Math.round((base[0]! + offset) * 255), Math.round((base[1]! + offset) * 255), Math.round((base[2]! + offset) * 255)];
}

/**
 * Resolves any value the sanitizer's own `COLOR_PATTERN` admits into opaque
 * sRGB, or `undefined` when it cannot be resolved. `undefined` is a real
 * answer, not an error case: the caller's whole job is to fail closed on a
 * colour it cannot vouch for, and "translucent" and "malformed" are both
 * genuinely unmeasurable rather than merely inconvenient.
 */
function parseColor(value: string): Srgb | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("#")) return parseHex(normalized);
  const parts = parseFunctionArguments(normalized);
  const isHsl = normalized.startsWith("hsl");
  if (parts.length === 4) {
    // The alpha channel of an rgba()/hsla(): anything but fully opaque has no
    // measurable contrast here. `%` is legal for alpha too.
    if (toNumber(parts[3]!, 1) !== 1) return undefined;
  } else if (parts.length !== 3) {
    return undefined;
  }
  const raw: Srgb = isHsl
    ? [toNumber(parts[0]!, 1), toNumber(parts[1]!, 1), toNumber(parts[2]!, 1)]
    : [toNumber(parts[0]!, 255), toNumber(parts[1]!, 255), toNumber(parts[2]!, 255)];
  // Finite BEFORE conversion, not after. `hslChannels` indexes a six-entry
  // sector table with `Math.floor(sector) % 6`, which is NaN for a NaN hue
  // and yields `undefined` rather than a row — so a post-hoc check never gets
  // to run. COLOR_PATTERN admits `.` inside its numeric class, so
  // `hsl(.,50%,50%)` is shape-valid and really arrives here.
  if (raw.some((value) => !Number.isFinite(value))) return undefined;
  const channels = isHsl ? hslChannels(raw[0], raw[1], raw[2]) : raw;
  if (channels.some((channel) => channel < 0 || channel > 255)) return undefined;
  return channels;
}

/** One sRGB channel, gamma-expanded to linear light (WCAG relative
 * luminance, step 1). */
function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: Srgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * WCAG 2.x contrast ratio between two CSS colours, `(L1 + 0.05) / (L2 + 0.05)`
 * with the lighter luminance on top — symmetric by construction, so no caller
 * has to remember which argument is the foreground.
 *
 * Returns `undefined` rather than a number for anything outside opaque sRGB.
 * Lives HERE, in the L0 protocol package that already owns the token
 * vocabulary, because the thing being measured is a property of that
 * vocabulary; it needs no DOM, no stylesheet and no workspace dependency,
 * which is also what keeps the `l0-widget-protocol-no-workspace-deps`
 * boundary intact.
 */
export function contrastRatio(a: string, b: string): number | undefined {
  const [colorA, colorB] = [parseColor(a), parseColor(b)];
  if (colorA === undefined || colorB === undefined) return undefined;
  const [lighter, darker] = [relativeLuminance(colorA), relativeLuminance(colorB)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

/** The pairings a tenant value can actually break, named the way the warning
 * names them. Not "every pair of tokens": only the ones a player really reads
 * one on top of the other somewhere in the two stylesheets. */
export type ThemeContrastPair = "on-surface/surface" | "on-primary/primary" | "accent/ink" | "accent/surface";

export interface ThemeContrastViolation {
  readonly pair: ThemeContrastPair;
  /** `below-minimum` was measured and lost; `unverifiable` could not be
   * measured at all. Both drop, and the distinction is what makes the
   * warning actionable — one says "pick a lighter accent", the other says
   * "this value is not an opaque sRGB colour". */
  readonly reason: "below-minimum" | "unverifiable";
  /** The measured ratio. Absent exactly when `reason` is `unverifiable` —
   * never a stand-in number. */
  readonly ratio?: number;
  /** The tokens removed from the accepted theme, in `THEME_TOKEN_NAMES`
   * order so a diff of two runs is stable. */
  readonly dropped: readonly ThemeTokenName[];
}

export interface ThemeContrastResult {
  /** The accepted theme: the input minus every dropped token. Each dropped
   * token falls back to the `var(--gx-*, <default>)` value its own rule
   * already carries, which is why nothing has to be substituted here. */
  readonly theme: ThemeOverride;
  readonly violations: readonly ThemeContrastViolation[];
}

/** Ordered: the two self-contained foreground/background pairs first, then
 * accent against our own fixed ink, then accent against whatever SURFACE
 * survived the first rule. That last dependency is the whole reason this is a
 * list rather than a set — checking accent against a surface the first rule
 * already rejected would validate a pairing that will never render. */
const CONTRAST_RULES: readonly {
  readonly pair: ThemeContrastPair;
  readonly foreground: ThemeTokenName | typeof ACCENT_INK;
  readonly background: ThemeTokenName;
  /** Which of the two tenant tokens go back to their defaults on a failure. */
  readonly dropped: readonly ThemeTokenName[];
}[] = [
  {
    pair: "on-surface/surface",
    foreground: "--gx-color-on-surface",
    background: "--gx-color-surface",
    dropped: ["--gx-color-surface", "--gx-color-on-surface"],
  },
  {
    pair: "on-primary/primary",
    foreground: "--gx-color-on-primary",
    background: "--gx-color-primary",
    dropped: ["--gx-color-primary", "--gx-color-on-primary"],
  },
  { pair: "accent/ink", foreground: ACCENT_INK, background: "--gx-color-accent", dropped: ["--gx-color-accent"] },
  { pair: "accent/surface", foreground: "--gx-color-accent", background: "--gx-color-surface", dropped: ["--gx-color-accent"] },
];

/**
 * Rejects the tenant colour pairings a player could not read, and returns
 * what survives (design §10, WCAG 2.x SC 1.4.3).
 *
 * PURE, and deliberately in the same L0 package as `sanitizeThemeOverride`:
 * both real theming paths already funnel through that sanitizer, so this is
 * the one place a contrast rule can be written once and hold for the
 * `HEXDEV_TENANTS_JSON` path (`platform-core`'s `tenant-auth.ts`) and the
 * host-page `data-theme-*` path (`widget-sdk`'s `widget-config.ts`) alike.
 * Shape validation answers "could this string escape the declaration it is
 * assigned into"; this answers "can a human read the result" — different
 * questions, deliberately separate functions, same choke point.
 *
 * DROP, NEVER CLAMP. Auto-adjusting a failing colour's lightness until it
 * passes would repaint a brand colour the tenant never approved and never
 * agreed to — it would produce a wrong-but-plausible brand, silently, and a
 * tenant comparing the widget against its own brand guide would have no way
 * to tell what happened. Falling back to the widget's own known-good default
 * is honest (nobody's brand is misrepresented), diffable (the token is either
 * the tenant's value or ours, never a third one nobody chose) and matches
 * `sanitizeThemeOverride`'s own established drop-silently posture. The
 * SILENT half is what the returned `violations` fix: the caller is expected
 * to say so out loud.
 *
 * FAIL CLOSED, PER PAIR. A pair that fails takes every TENANT token it is
 * made of back to defaults — both sides for the two foreground/background
 * pairs, because a default pairing is a measured, shipped pairing while half
 * a tenant's brand against the other half's default is a combination nobody
 * ever looked at. `accent/ink` and `accent/surface` can only drop the accent:
 * the ink is not a tenant token at all, and the surface, when present, was
 * already validated on its own terms by the first rule.
 *
 * KNOWN LIMIT, named rather than hidden — a pair is only checked when BOTH
 * sides are present in the override. The absent side would be a per-zone
 * stylesheet default this package genuinely does not know: `chrome-styles.ts`
 * defaults to `#1a1a1a` on `#ffffff`, `table-styles.ts` to `#f2f2f2` on
 * `#1c1c1c` — opposite ends of the scale, and no third value is right for
 * both. A tenant supplying only `--gx-color-on-surface` therefore passes
 * unchecked, and there is no honest way to close that from inside this
 * package.
 *
 * It is narrower than it looks, because "the override" is whatever the caller
 * assembles rather than one source's tokens: `applyThemeToRoot` merges the
 * host page's theme over the tokens already applied to the element before
 * calling this, so a host page overriding one half of a pair the tenant
 * already supplied arrives here as a COMPLETE pair and is measured. What
 * genuinely survives is only the case where neither source ever named the
 * other half at all.
 *
 * SECOND KNOWN LIMIT: this is a PAIRWISE rule over the tenant vocabulary, and
 * it structurally cannot see a tenant colour drawn over a NON-tenant surface
 * — the felt cloth, the recessed action lane, the relation label's fixed
 * black scrim. That class is closed structurally instead, by giving those
 * rules their own private `--hx-felt-text` token (`table-styles.ts`); see
 * this file's own test for the measured proof that a fully-passing theme
 * still broke the felt before that change.
 */
export function validateThemeContrast(theme: ThemeOverride): ThemeContrastResult {
  const accepted: ThemeOverride = { ...theme };
  const violations: ThemeContrastViolation[] = [];

  for (const rule of CONTRAST_RULES) {
    const background = accepted[rule.background];
    const foreground = rule.foreground === ACCENT_INK ? ACCENT_INK : accepted[rule.foreground];
    if (background === undefined || foreground === undefined) continue;

    const ratio = contrastRatio(foreground, background);
    if (ratio !== undefined && ratio >= AA_NORMAL_TEXT_CONTRAST) continue;

    const dropped = rule.dropped.filter((name) => accepted[name] !== undefined);
    for (const name of dropped) delete accepted[name];
    violations.push(ratio === undefined ? { pair: rule.pair, reason: "unverifiable", dropped } : { pair: rule.pair, reason: "below-minimum", ratio, dropped });
  }

  return { theme: accepted, violations };
}

/**
 * The one sentence both entry points log, so a warning read in a server boot
 * log and one read in a browser console are the same sentence about the same
 * failure. Callers prefix their own context (which tenant, which path); this
 * owns everything that is a property of the violation itself.
 */
export function describeThemeContrastViolation(violation: ThemeContrastViolation): string {
  const measurement =
    violation.ratio === undefined
      ? "could not be measured (not an opaque sRGB colour)"
      : `measures ${violation.ratio.toFixed(2)}:1, under the ${String(AA_NORMAL_TEXT_CONTRAST)}:1 WCAG AA minimum for normal text`;
  return `theme contrast: ${violation.pair} ${measurement} — dropping ${violation.dropped.join(", ")} back to the widget's own default.`;
}
