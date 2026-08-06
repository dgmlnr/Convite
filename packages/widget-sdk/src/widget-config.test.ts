import { describe, expect, it } from "vitest";
import { parseTargetOrigin } from "@hexdev/widget-protocol";
import { buildEmbedUrl, readLoaderConfig, type ScriptTagLike } from "./widget-config.js";

function fakeScriptTag(attributes: Readonly<Record<string, string>>): ScriptTagLike {
  return {
    getAttribute: (name) => (Object.hasOwn(attributes, name) ? attributes[name] : null),
  };
}

describe("readLoaderConfig", () => {
  it("reads the embed key from data-embed-key", () => {
    const config = readLoaderConfig(fakeScriptTag({ "data-embed-key": "pk_live_t_abc" }));

    expect(config?.embedKey).toBe("pk_live_t_abc");
  });

  it("returns null when data-embed-key is missing — a tenant forgot their key", () => {
    const config = readLoaderConfig(fakeScriptTag({}));

    expect(config).toBeNull();
  });

  it("returns null when data-embed-key is present but blank", () => {
    const config = readLoaderConfig(fakeScriptTag({ "data-embed-key": "   " }));

    expect(config).toBeNull();
  });

  it("collects a valid data-theme-* override into the sanitized theme vocabulary", () => {
    const config = readLoaderConfig(
      fakeScriptTag({ "data-embed-key": "pk_live_t_abc", "data-theme-color-primary": "#112233" }),
    );

    expect(config?.themeOverride).toEqual({ "--gx-color-primary": "#112233" });
  });

  it("drops a data-theme-* override whose value fails its token's own validation", () => {
    const config = readLoaderConfig(
      fakeScriptTag({
        "data-embed-key": "pk_live_t_abc",
        "data-theme-color-primary": "red; } body { display: none",
      }),
    );

    expect(config?.themeOverride).toEqual({});
  });
});

describe("buildEmbedUrl", () => {
  it("builds an /embed URL carrying the embed key and the host origin as query params", () => {
    const widgetOrigin = parseTargetOrigin("https://play.hexdev.example");
    const config = { embedKey: "pk_live_t_abc", themeOverride: {} };

    const url = buildEmbedUrl(widgetOrigin, config, "https://tenant.example");

    expect(url).toBe(
      "https://play.hexdev.example/embed?k=pk_live_t_abc&o=https%3A%2F%2Ftenant.example",
    );
  });

  it("produces a distinct URL for a distinct host origin, proving the param is real, not hardcoded", () => {
    const widgetOrigin = parseTargetOrigin("https://play.hexdev.example");
    const config = { embedKey: "pk_live_t_abc", themeOverride: {} };

    const url = buildEmbedUrl(widgetOrigin, config, "https://another-tenant.example");

    expect(url).toContain("o=https%3A%2F%2Fanother-tenant.example");
  });
});
