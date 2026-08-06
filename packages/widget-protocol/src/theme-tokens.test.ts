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
