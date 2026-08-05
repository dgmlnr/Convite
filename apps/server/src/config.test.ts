import { describe, expect, it } from "vitest";
import { loadServerConfig } from "./config.js";

describe("loadServerConfig", () => {
  it("refuses to start in production with no session secret configured", () => {
    expect(() => loadServerConfig({ NODE_ENV: "production" })).toThrow(/HEXDEV_SESSION_SECRET/);
  });

  it("falls back to an obviously-labeled dev secret outside production", () => {
    const config = loadServerConfig({ NODE_ENV: "development" });
    expect(config.sessionSecret).toMatch(/dev-only/i);
  });

  it("uses HEXDEV_SESSION_SECRET from the environment when present, even in production", () => {
    const config = loadServerConfig({ NODE_ENV: "production", HEXDEV_SESSION_SECRET: "a-real-secret" });
    expect(config.sessionSecret).toBe("a-real-secret");
  });

  it("defaults the port, falling back when PORT is unset", () => {
    expect(loadServerConfig({}).port).toBeGreaterThan(0);
  });

  it("reads PORT from the environment when set", () => {
    expect(loadServerConfig({ PORT: "4001" }).port).toBe(4001);
  });

  it("falls back to a single dev tenant when HEXDEV_TENANTS_JSON is unset", () => {
    const config = loadServerConfig({});
    expect(config.tenants.length).toBeGreaterThan(0);
    expect(config.tenants[0]?.entitledGames).toContain("truco-argentino");
  });

  it("parses tenant records from HEXDEV_TENANTS_JSON when set", () => {
    const tenants = [{ id: "t1", embedKey: "pk_x", allowedOrigins: ["https://a.example"], entitledGames: ["truco-argentino"] }];
    const config = loadServerConfig({ HEXDEV_TENANTS_JSON: JSON.stringify(tenants) });
    expect(config.tenants).toEqual(tenants);
  });
});
