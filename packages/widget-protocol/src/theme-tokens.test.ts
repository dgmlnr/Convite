import { describe, expect, it } from "vitest";
import {
  AA_NORMAL_TEXT_CONTRAST,
  ACCENT_INK,
  contrastRatio,
  sanitizeThemeOverride,
  THEME_TOKEN_NAMES,
  validateThemeContrast,
} from "./theme-tokens.js";

describe("sanitizeThemeOverride", () => {
  it("keeps a known color token whose value matches the color pattern", () => {
    const result = sanitizeThemeOverride({ "--gx-color-primary": "#1a2b3c" });

    expect(result).toEqual({ "--gx-color-primary": "#1a2b3c" });
  });

  it("keeps a known length token whose value matches the length pattern", () => {
    const result = sanitizeThemeOverride({ "--gx-radius": "0.5rem" });

    expect(result).toEqual({ "--gx-radius": "0.5rem" });
  });

  it("drops a known token whose value does not match its pattern (injection attempt)", () => {
    const result = sanitizeThemeOverride({
      "--gx-color-primary": "red; } body { display: none",
    });

    expect(result).toEqual({});
  });

  it("drops a key that is not in the closed token vocabulary, however plausible", () => {
    const result = sanitizeThemeOverride({ "--gx-background-image": "url(javascript:alert(1))" });

    expect(result).toEqual({});
  });

  it("only ever returns keys drawn from THEME_TOKEN_NAMES, never arbitrary input keys", () => {
    const result = sanitizeThemeOverride({
      "--gx-color-primary": "#fff",
      "--gx-color-accent": "#000",
      "__proto__": "polluted",
    });

    expect(Object.keys(result).sort()).toEqual(["--gx-color-accent", "--gx-color-primary"]);
    for (const key of Object.keys(result)) {
      expect(THEME_TOKEN_NAMES).toContain(key);
    }
  });

  it("rejects a non-string value for a known token", () => {
    const result = sanitizeThemeOverride({ "--gx-radius": 12 as unknown as string });

    expect(result).toEqual({});
  });

  it("keeps every hex LENGTH that CSS actually defines — 3, 4, 6 and 8 digits", () => {
    for (const value of ["#abc", "#abcd", "#aabbcc", "#aabbccdd"]) {
      expect(sanitizeThemeOverride({ "--gx-color-primary": value })).toEqual({ "--gx-color-primary": value });
    }
  });

  it("drops a 5- or 7-digit hex: CSS defines neither, so the browser discards the declaration and the token silently does not apply", () => {
    // The pattern used to admit `#[0-9a-fA-F]{3,8}`, which is wider than CSS
    // itself. A value that can only ever be discarded has no business passing
    // shape validation — it turns "your brand did not apply" into a mystery
    // with nothing logged and nothing to look at. Tightening rejects only
    // lengths CSS has no meaning for, so no legitimate colour is lost.
    expect(sanitizeThemeOverride({ "--gx-color-primary": "#12345" })).toEqual({});
    expect(sanitizeThemeOverride({ "--gx-color-primary": "#1234567" })).toEqual({});
  });
});

describe("THEME_TOKEN_NAMES (VDS-1 guard: the private --hx-* token layer must never join the closed tenant vocabulary)", () => {
  // Deliberately placed here rather than truco-ui's table-styles.test.ts
  // (the tasks artifact's own suggested default): this file already owns
  // THEME_TOKEN_NAMES's shape, and truco-ui has no existing dependency on
  // @hexdev/widget-protocol -- keeping the guard beside the vocabulary it
  // protects avoids adding a new cross-package dependency for a single
  // assertion.
  //
  // Proven capable of failing (not just of passing) before being committed,
  // both assertions independently, via `pnpm exec vitest run
  // theme-tokens.test.ts`:
  //   1. temporarily APPENDED "--hx-test" (length 7 -> 8) -- RED on the
  //      toHaveLength(7) assertion (expected 7, got 8);
  //   2. reverted, then temporarily REPLACED an entry with "--hx-test"
  //      (length held at 7) -- RED on the startsWith loop assertion
  //      (expected false, got true), proving that assertion is reachable
  //      and load-bearing, not dead code behind the length check;
  // reverted after each -- theme-tokens.ts is byte-identical to before this
  // guard existed -- then re-ran to confirm GREEN again (7/7 passing).
  it("stays a 7-entry closed vocabulary with no --hx- entry", () => {
    expect(THEME_TOKEN_NAMES).toHaveLength(7);

    for (const name of THEME_TOKEN_NAMES) {
      expect(name.startsWith("--hx-")).toBe(false);
    }
  });
});

describe("contrastRatio (WCAG 2.x relative luminance, sRGB linearization)", () => {
  it("returns 21 for the extremes — black against white is the maximum the formula can produce", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
  });

  it("is symmetric: which colour is named first cannot change the ratio", () => {
    expect(contrastRatio("#123456", "#1a1a1a")).toBe(contrastRatio("#1a1a1a", "#123456"));
  });

  it("measures the audit's dark tenant accent against the fixed accent ink at 1.37:1", () => {
    // The failure the guard exists for: #123456 as --gx-color-accent paints
    // the badge, the response buttons, the seña signal, play-again and the
    // mano tag, and EVERY one of them draws --hx-ink (#1a1a1a) on top of it.
    expect(contrastRatio("#123456", ACCENT_INK)).toBeCloseTo(1.37, 2);
  });

  it("measures a genuinely passing pair — the widget's own default primary under its own default on-primary — at 5.99:1", () => {
    expect(contrastRatio("#2f6f4f", "#ffffff")).toBeCloseTo(5.99, 2);
  });

  it("measures the fixed accent ink against white at 17.40:1", () => {
    expect(contrastRatio("#ffffff", ACCENT_INK)).toBeCloseTo(17.4, 2);
  });

  it("reads the whole colour vocabulary the sanitizer admits — short hex, rgb() and hsl() all resolve to the same sRGB point", () => {
    expect(contrastRatio("#000", "#fff")).toBe(21);
    expect(contrastRatio("rgb(0, 0, 0)", "rgb(255, 255, 255)")).toBe(21);
    expect(contrastRatio("hsl(0, 0%, 0%)", "hsl(0, 0%, 100%)")).toBe(21);
  });

  it("fails closed on a malformed HSL instead of throwing — COLOR_PATTERN admits `.` inside its numeric class, so a NaN hue really reaches the parser", () => {
    // A NaN hue makes `Math.floor(sector) % 6` NaN, which indexes the
    // six-entry sector table to `undefined` — a TypeError raised BEFORE any
    // post-hoc finite check could run. The rgb branch never had this shape.
    expect(() => contrastRatio("hsl(.,50%,50%)", "#ffffff")).not.toThrow();
    expect(contrastRatio("hsl(.,50%,50%)", "#ffffff")).toBeUndefined();
    expect(contrastRatio("hsl(., ., .)", "#ffffff")).toBeUndefined();
  });

  it("refuses to invent a ratio it cannot measure: a translucent colour has no contrast without a backdrop, and a malformed hex is not a colour at all", () => {
    expect(contrastRatio("rgba(0, 0, 0, 0.5)", "#ffffff")).toBeUndefined();
    expect(contrastRatio("#12345678", "#ffffff")).toBeUndefined();
    // A 5-digit hex is not a colour. The sanitizer now rejects it outright,
    // but this function is exported and takes raw strings, so it must answer
    // for values that never went through the sanitizer at all.
    expect(contrastRatio("#12345", "#ffffff")).toBeUndefined();
  });
});

describe("validateThemeContrast (design §10: a tenant may pick its brand, never a pairing a player cannot read)", () => {
  it("leaves a fully-passing theme byte-identical and reports nothing — the widget's own shipped default palette is that theme", () => {
    const theme = {
      "--gx-color-surface": "#1c1c1c",
      "--gx-color-on-surface": "#f2f2f2",
      "--gx-color-primary": "#2f6f4f",
      "--gx-color-on-primary": "#ffffff",
      "--gx-color-accent": "#e8c877",
    };

    const result = validateThemeContrast(theme);

    expect(result.theme).toEqual(theme);
    expect(result.violations).toEqual([]);
  });

  it("is a no-op on a theme with no overrides at all — a tenant that configured nothing must not be told it did something wrong", () => {
    const result = validateThemeContrast({});

    expect(result.theme).toEqual({});
    expect(result.violations).toEqual([]);
  });

  it("drops the audit's dark tenant accent, measured at 1.37:1 against the fixed ink every accent surface paints on top of it", () => {
    const result = validateThemeContrast({
      "--gx-color-surface": "#ffffff",
      "--gx-color-on-surface": "#1a1a1a",
      "--gx-color-accent": "#123456",
    });

    expect(result.theme["--gx-color-accent"]).toBeUndefined();
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.pair).toBe("accent/ink");
    expect(result.violations[0]?.reason).toBe("below-minimum");
    expect(result.violations[0]?.ratio).toBeCloseTo(1.37, 2);
    expect(result.violations[0]?.dropped).toEqual(["--gx-color-accent"]);
  });

  it("keeps every pair that genuinely passes while dropping the one that does not — a partial drop, never all-or-nothing", () => {
    const result = validateThemeContrast({
      "--gx-color-surface": "#ffffff",
      "--gx-color-on-surface": "#1a1a1a",
      "--gx-color-primary": "#0b5fff",
      "--gx-color-on-primary": "#ffffff",
      "--gx-color-accent": "#123456",
      "--gx-radius": "4px",
      "--gx-font-family": "Inter, sans-serif",
    });

    expect(result.theme).toEqual({
      "--gx-color-surface": "#ffffff",
      "--gx-color-on-surface": "#1a1a1a",
      "--gx-color-primary": "#0b5fff",
      "--gx-color-on-primary": "#ffffff",
      "--gx-radius": "4px",
      "--gx-font-family": "Inter, sans-serif",
    });
  });

  it("drops BOTH sides of a failing foreground/background pair, so what renders is a known-good default PAIRING rather than half a tenant's brand against a default it was never measured with", () => {
    const result = validateThemeContrast({
      "--gx-color-surface": "#1c1c1c",
      "--gx-color-on-surface": "#3a3a3a",
    });

    expect(result.theme).toEqual({});
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.pair).toBe("on-surface/surface");
    expect(result.violations[0]?.ratio).toBeCloseTo(1.5, 2);
    expect(result.violations[0]?.dropped).toEqual(["--gx-color-surface", "--gx-color-on-surface"]);
  });

  it("checks accent as TEXT over the tenant's own surface too — the gold accent the widget ships is unreadable at 1.62:1 once a tenant paints its surface white", () => {
    // .hexdev-truco-team-label and .hexdev-truco-sena-notice-signal draw the
    // accent as TEXT on --gx-color-surface, so accent is a foreground here
    // and a background at accent/ink. Only accent is dropped: the
    // surface/on-surface pair was already validated on its own terms above
    // and stays self-consistent without it.
    const result = validateThemeContrast({
      "--gx-color-surface": "#ffffff",
      "--gx-color-on-surface": "#1a1a1a",
      "--gx-color-accent": "#e8c877",
    });

    expect(result.theme).toEqual({ "--gx-color-surface": "#ffffff", "--gx-color-on-surface": "#1a1a1a" });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.pair).toBe("accent/surface");
    expect(result.violations[0]?.ratio).toBeCloseTo(1.62, 2);
    expect(result.violations[0]?.dropped).toEqual(["--gx-color-accent"]);
  });

  it("a self-consistent light-brand theme passes EVERY pairwise rule untouched — the exact measured proof that this guard cannot, alone, close the cross-zone class", () => {
    // The audit's second hostile theme: white surface, near-black on-surface,
    // a real brand blue. Every pair this guard can form is comfortably over
    // 4.5:1, so nothing is dropped and nothing is warned about -- and that
    // near-black --gx-color-on-surface is still what four FELT rules paint
    // their text with, over a green cloth no tenant token can touch. No
    // pairwise rule can see that pairing, because the cloth is not in the
    // tenant vocabulary at all. Closing it is a STRUCTURAL job, done by
    // table-styles.ts's own private --hx-felt-text token, not by this
    // function.
    const theme = {
      "--gx-color-surface": "#ffffff",
      "--gx-color-on-surface": "#1a1a1a",
      "--gx-color-primary": "#0b5fff",
      "--gx-color-on-primary": "#ffffff",
    };

    const result = validateThemeContrast(theme);

    expect(result.theme).toEqual(theme);
    expect(result.violations).toEqual([]);
    expect(contrastRatio("#1a1a1a", "#ffffff")).toBeGreaterThan(AA_NORMAL_TEXT_CONTRAST);
    expect(contrastRatio("#ffffff", "#0b5fff")).toBeGreaterThan(AA_NORMAL_TEXT_CONTRAST);
  });

  it("drops a malformed HSL rather than throwing out of the guard entirely", () => {
    const result = validateThemeContrast({ "--gx-color-surface": "hsl(.,50%,50%)", "--gx-color-on-surface": "#f2f2f2" });

    expect(result.theme).toEqual({});
    expect(result.violations[0]?.reason).toBe("unverifiable");
  });

  it("fails closed on a colour it cannot measure rather than passing it through unchecked", () => {
    const result = validateThemeContrast({
      "--gx-color-surface": "rgba(20, 20, 20, 0.72)",
      "--gx-color-on-surface": "#f2f2f2",
    });

    expect(result.theme).toEqual({});
    expect(result.violations[0]?.reason).toBe("unverifiable");
    expect(result.violations[0]?.ratio).toBeUndefined();
  });

  it("never checks a pair the tenant only half-supplied — the absent side is a per-zone stylesheet default this package deliberately does not know", () => {
    // chrome-styles.ts defaults on-surface to #1a1a1a on a #ffffff surface;
    // table-styles.ts defaults it to #f2f2f2 on a #1c1c1c one. There is no
    // single value to check the tenant's half against, and inventing one
    // would be wrong in whichever zone it did not come from. Named debt, not
    // an oversight -- see validateThemeContrast's own docstring.
    const result = validateThemeContrast({ "--gx-color-primary": "#336699" });

    expect(result.theme).toEqual({ "--gx-color-primary": "#336699" });
    expect(result.violations).toEqual([]);
  });
});
