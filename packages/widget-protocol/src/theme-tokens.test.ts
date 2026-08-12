import { describe, expect, it } from "vitest";
import { sanitizeThemeOverride, THEME_TOKEN_NAMES } from "./theme-tokens.js";

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
