import { describe, expect, it } from "vitest";
import { createSessionTokenIssuer } from "@hexdev/platform-core";
import { loadServerConfig } from "./config.js";

/** Every non-secret-focused test below needs the explicit dev opt-in — the
 * secret guard now fails loudly by default (hardening: public surface,
 * obs 2945), not only in `NODE_ENV=production`. */
const DEV_OPT_IN = { HEXDEV_ALLOW_DEV_DEFAULTS: "true" };

describe("loadServerConfig", () => {
  it("uses HEXDEV_SESSION_SIGNING_KEY from the environment when present, even in production", () => {
    const config = loadServerConfig({ NODE_ENV: "production", HEXDEV_SESSION_SIGNING_KEY: "a-real-signing-key" });
    expect(config.sessionSigningKey).toBe("a-real-signing-key");
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

  it("defaults redisUrl to undefined — no Redis, no new required config for a single-instance deploy", () => {
    expect(loadServerConfig(DEV_OPT_IN).redisUrl).toBeUndefined();
  });

  it("reads HEXDEV_REDIS_URL when set — the ONE knob that switches every port to its Redis-backed adapter together", () => {
    const config = loadServerConfig({ ...DEV_OPT_IN, HEXDEV_REDIS_URL: "redis://localhost:6379" });
    expect(config.redisUrl).toBe("redis://localhost:6379");
  });

  it("defaults publicAddress to undefined, and reads HEXDEV_PUBLIC_ADDRESS when set (this process's own reachable host:port for cross-instance room routing)", () => {
    expect(loadServerConfig(DEV_OPT_IN).publicAddress).toBeUndefined();
    expect(loadServerConfig({ ...DEV_OPT_IN, HEXDEV_PUBLIC_ADDRESS: "127.0.0.1:2568" }).publicAddress).toBe("127.0.0.1:2568");
  });

  it("defaults queueBotFillSeconds to 30, and reads HEXDEV_QUEUE_BOT_FILL_SECONDS when set (PR-2b: how long a >2-seat queue waits before bot-fill degradation)", () => {
    expect(loadServerConfig(DEV_OPT_IN).queueBotFillSeconds).toBe(30);
    expect(loadServerConfig({ ...DEV_OPT_IN, HEXDEV_QUEUE_BOT_FILL_SECONDS: "5" }).queueBotFillSeconds).toBe(5);
  });
});

describe("loadServerConfig — fail-loud by default (hardening: public surface, obs 2945)", () => {
  it("refuses to start with no session secret and no explicit dev opt-in, regardless of NODE_ENV", () => {
    expect(() => loadServerConfig({})).toThrow(/HEXDEV_SESSION_SIGNING_KEY/);
    expect(() => loadServerConfig({ NODE_ENV: "staging" })).toThrow(/HEXDEV_SESSION_SIGNING_KEY/);
    expect(() => loadServerConfig({ NODE_ENV: "prod" })).toThrow(/HEXDEV_SESSION_SIGNING_KEY/);
  });

  it("only falls back to the dev signing key when HEXDEV_ALLOW_DEV_DEFAULTS is explicitly set", () => {
    // The dev default is now a validly-shaped Ed25519 seed (opaque base64url,
    // not a human-readable string) — same "obviously insecure, checked into
    // source, never reachable in production" property as before, just no
    // longer literally spelled "dev-only" in the value itself. Asserting a
    // NON-EMPTY string here (any string would satisfy `/dev-only/i` on the
    // OLD HMAC secret; the real "is this really the fallback" proof is
    // config.ts's own docstring identifying exactly which constant this is).
    const config = loadServerConfig(DEV_OPT_IN);
    expect(config.sessionSigningKey.length).toBeGreaterThan(0);
    expect(config.sessionSigningKey).not.toBe("a-real-signing-key");
  });

  it("still refuses to start in production even with the dev opt-in flag set", () => {
    expect(() => loadServerConfig({ NODE_ENV: "production", ...DEV_OPT_IN })).toThrow(/production/);
  });

  it("refuses a non-numeric, zero, or negative HEXDEV_QUEUE_BOT_FILL_SECONDS — a NaN/non-positive threshold would silently bot-fill every >2-seat queue on its first sweep tick", () => {
    for (const value of ["abc", "-5", "0"]) {
      expect(() => loadServerConfig({ ...DEV_OPT_IN, HEXDEV_QUEUE_BOT_FILL_SECONDS: value })).toThrow(/HEXDEV_QUEUE_BOT_FILL_SECONDS/);
    }
  });
});

describe("loadServerConfig + createSessionTokenIssuer — the FULL boot path refuses a malformed signing key (deviation-closing brief: 'a missing or malformed key in production must refuse to boot')", () => {
  it("loadServerConfig accepts ANY present string (presence only, not shape) — malformed shape is caught downstream, at key-import time", () => {
    // Deliberately NOT a valid 32-byte Ed25519 seed once base64url-decoded —
    // `loadServerConfig` itself does not reject this (see its own docstring:
    // shape validation is `createSessionTokenIssuer`'s job).
    const config = loadServerConfig({ NODE_ENV: "production", HEXDEV_SESSION_SIGNING_KEY: "not-a-real-key" });
    expect(config.sessionSigningKey).toBe("not-a-real-key");
  });

  it("createSessionTokenIssuer refuses the malformed key loadServerConfig passed through — the composition root's top-level `await` (index.ts) turns this into a boot crash, same convention as redis-client.ts's fail-loud connect", async () => {
    const config = loadServerConfig({ NODE_ENV: "production", HEXDEV_SESSION_SIGNING_KEY: "not-a-real-key" });
    await expect(createSessionTokenIssuer(config.sessionSigningKey)).rejects.toThrow(/malformed/i);
  });
});
