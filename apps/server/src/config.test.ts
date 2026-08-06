import { describe, expect, it } from "vitest";
import { loadServerConfig } from "./config.js";

/** Every non-secret-focused test below needs the explicit dev opt-in — the
 * secret guard now fails loudly by default (hardening: public surface,
 * obs 2945), not only in `NODE_ENV=production`. */
const DEV_OPT_IN = { HEXDEV_ALLOW_DEV_DEFAULTS: "true" };

describe("loadServerConfig", () => {
  it("uses HEXDEV_SESSION_SECRET from the environment when present, even in production", () => {
    const config = loadServerConfig({ NODE_ENV: "production", HEXDEV_SESSION_SECRET: "a-real-secret" });
    expect(config.sessionSecret).toBe("a-real-secret");
  });

  it("defaults the port, falling back when PORT is unset", () => {
    expect(loadServerConfig(DEV_OPT_IN).port).toBeGreaterThan(0);
  });

  it("reads PORT from the environment when set", () => {
    expect(loadServerConfig({ ...DEV_OPT_IN, PORT: "4001" }).port).toBe(4001);
  });

  it("falls back to a single dev tenant when HEXDEV_TENANTS_JSON is unset", () => {
    const config = loadServerConfig(DEV_OPT_IN);
    expect(config.tenants.length).toBeGreaterThan(0);
    expect(config.tenants[0]?.entitledGames).toContain("truco-argentino");
  });

  it("parses tenant records from HEXDEV_TENANTS_JSON when set", () => {
    const tenants = [{ id: "t1", embedKey: "pk_x", allowedOrigins: ["https://a.example"], entitledGames: ["truco-argentino"] }];
    const config = loadServerConfig({ ...DEV_OPT_IN, HEXDEV_TENANTS_JSON: JSON.stringify(tenants) });
    expect(config.tenants).toEqual(tenants);
  });

  it("defaults the rate-limit settings for /embed (IP and key) and room join", () => {
    const config = loadServerConfig(DEV_OPT_IN);
    expect(config.embedIpRateLimit.limit).toBeGreaterThan(0);
    expect(config.embedKeyRateLimit.limit).toBeGreaterThan(0);
    expect(config.joinIpRateLimit.limit).toBeGreaterThan(0);
  });

  it("defaults allowedWidgetOrigins to this server's own dev origin (MatchRoom.onAuth's re-validation target — see MatchRoomAuthOptions's own docstring for why this is the WIDGET's origin, not a tenant's)", () => {
    const config = loadServerConfig({ ...DEV_OPT_IN, PORT: "4001" });
    expect(config.allowedWidgetOrigins).toContain("http://localhost:4001");
  });

  it("reads HEXDEV_WIDGET_ORIGIN as a comma-separated list when set, overriding the port-derived default", () => {
    const config = loadServerConfig({ ...DEV_OPT_IN, HEXDEV_WIDGET_ORIGIN: "https://play.hexdev.example,https://play-staging.hexdev.example" });
    expect(config.allowedWidgetOrigins).toEqual(["https://play.hexdev.example", "https://play-staging.hexdev.example"]);
  });

  it("reads rate-limit settings from the environment when set", () => {
    const config = loadServerConfig({ ...DEV_OPT_IN, HEXDEV_EMBED_IP_RATE_LIMIT: "5", HEXDEV_EMBED_IP_RATE_WINDOW_MS: "1000" });
    expect(config.embedIpRateLimit).toEqual({ limit: 5, windowMs: 1000 });
  });
});

describe("loadServerConfig — fail-loud by default (hardening: public surface, obs 2945)", () => {
  it("refuses to start with no session secret and no explicit dev opt-in, regardless of NODE_ENV", () => {
    expect(() => loadServerConfig({})).toThrow(/HEXDEV_SESSION_SECRET/);
    expect(() => loadServerConfig({ NODE_ENV: "staging" })).toThrow(/HEXDEV_SESSION_SECRET/);
    expect(() => loadServerConfig({ NODE_ENV: "prod" })).toThrow(/HEXDEV_SESSION_SECRET/);
  });

  it("only falls back to the dev secret when HEXDEV_ALLOW_DEV_DEFAULTS is explicitly set", () => {
    expect(loadServerConfig(DEV_OPT_IN).sessionSecret).toMatch(/dev-only/i);
  });

  it("still refuses to start in production even with the dev opt-in flag set", () => {
    expect(() => loadServerConfig({ NODE_ENV: "production", ...DEV_OPT_IN })).toThrow(/production/);
  });
});
