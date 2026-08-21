import { describe, expect, it } from "vitest";

import { loadMintConfig } from "./config.js";

const KEY = "oUW9QPNCc-C-rkyKCakJbggyhW2quFy4Kv98Pyd7MeI";

/**
 * This role is the ONLY one that holds the Ed25519 seed, which is the entire
 * point of splitting it out. Its config guards therefore matter more than the
 * match role's, not less: a mint process that boots with a dev default in
 * production would hand the whole fleet's blast radius straight back.
 */
describe("loadMintConfig", () => {
  it("reads the signing key it is given", () => {
    expect(loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY }).sessionSigningKey).toBe(KEY);
  });

  describe("without a signing key", () => {
    it("refuses to start in production", () => {
      expect(() => loadMintConfig({ NODE_ENV: "production" })).toThrow(/HEXDEV_SESSION_SIGNING_KEY/);
    });

    /**
     * Fail-closed by DEFAULT, matching the match role's own guard: an unset,
     * "prod" or "staging" NODE_ENV must not be a way to run insecurely by
     * accident.
     */
    it("refuses to start anywhere else without an explicit opt-in", () => {
      expect(() => loadMintConfig({})).toThrow(/HEXDEV_ALLOW_DEV_DEFAULTS/);
      expect(() => loadMintConfig({ NODE_ENV: "staging" })).toThrow(/HEXDEV_ALLOW_DEV_DEFAULTS/);
      expect(() => loadMintConfig({ NODE_ENV: "prod" })).toThrow(/HEXDEV_ALLOW_DEV_DEFAULTS/);
    });

    it("allows the dev default only when opted into explicitly", () => {
      expect(loadMintConfig({ HEXDEV_ALLOW_DEV_DEFAULTS: "true" }).sessionSigningKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    /** Even the explicit opt-in loses to a real production NODE_ENV. */
    it("still refuses in production even with the opt-in set", () => {
      expect(() => loadMintConfig({ NODE_ENV: "production", HEXDEV_ALLOW_DEV_DEFAULTS: "true" })).toThrow(/production/);
    });
  });

  /**
   * SHAPE is deliberately not validated here, exactly as the match role's
   * config documents: `createSessionTokenIssuer` imports the real key and
   * throws on a malformed one, crashing boot. Keeping this function pure and
   * synchronous is what lets it be tested without Web Crypto.
   */
  it("passes a malformed key through rather than validating it here", () => {
    expect(loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: "not-a-real-key" }).sessionSigningKey).toBe("not-a-real-key");
  });

  it("defaults the widget origin to its own port, and honours a configured list", () => {
    expect(loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, PORT: "4000" }).allowedWidgetOrigins).toEqual(["http://localhost:4000"]);
    expect(loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_WIDGET_ORIGIN: "https://a.example,https://b.example" }).allowedWidgetOrigins).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("ships a curl-able dev tenant, and lets one be configured", () => {
    expect(loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY }).tenants).toHaveLength(1);
    const configured = loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_TENANTS_JSON: "[]" });
    expect(configured.tenants).toEqual([]);
  });

  /**
   * A numeric env var that is not a number is the failure mode this repo
   * already learned the hard way on HEXDEV_QUEUE_BOT_FILL_SECONDS: `Number()`
   * yields NaN, NaN slips straight through `??` because it is not nullish,
   * and every comparison against it is false — so the process starts and
   * misbehaves silently instead of refusing. Naming the offending variable
   * in the message is the difference between a five-minute fix and an hour.
   */
  describe("with a numeric variable that is not a number", () => {
    it("refuses a non-numeric PORT rather than listening on NaN", () => {
      expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, PORT: "not-a-port" })).toThrow(/PORT/);
    });

    it("refuses a non-positive or absurd PORT", () => {
      expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, PORT: "0" })).toThrow(/PORT/);
      expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, PORT: "70000" })).toThrow(/PORT/);
    });

    it("refuses a non-numeric rate limit, naming the variable", () => {
      expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_EMBED_IP_RATE_LIMIT: "lots" })).toThrow(/HEXDEV_EMBED_IP_RATE_LIMIT/);
      expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_EMBED_KEY_RATE_LIMIT: "lots" })).toThrow(/HEXDEV_EMBED_KEY_RATE_LIMIT/);
    });

    it("refuses a non-numeric rate window, naming the variable", () => {
      expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_EMBED_IP_RATE_WINDOW_MS: "soon" })).toThrow(/HEXDEV_EMBED_IP_RATE_WINDOW_MS/);
    });

    /** A limit of zero would lock every legitimate visitor out silently. */
    it("refuses a non-positive rate limit", () => {
      expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_EMBED_IP_RATE_LIMIT: "0" })).toThrow(/HEXDEV_EMBED_IP_RATE_LIMIT/);
    });

    it("still accepts a well-formed one", () => {
      const config = loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, PORT: "4000", HEXDEV_EMBED_IP_RATE_LIMIT: "5" });

      expect(config.port).toBe(4000);
      expect(config.embedIpRateLimit.limit).toBe(5);
    });
  });

  /**
   * A malformed tenants document is an operator typo, and the operator is
   * the one who has to fix it. A bare `SyntaxError: Unexpected token }` does
   * not say which variable it came from; the signing-key guard in this same
   * function already sets the standard for what a config failure should read
   * like.
   */
  it("refuses a malformed HEXDEV_TENANTS_JSON with a message that names it", () => {
    expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_TENANTS_JSON: "{oops" })).toThrow(/HEXDEV_TENANTS_JSON/);
  });

  it("refuses a HEXDEV_TENANTS_JSON that parses but is not a list of tenants", () => {
    expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_TENANTS_JSON: '{"id":"solo"}' })).toThrow(/HEXDEV_TENANTS_JSON/);
  });

  /**
   * The mint role does NOT carry the match role's knobs. Naming that here
   * keeps a future edit from quietly re-coupling the two configs.
   */
  it("carries only the front door's own concerns", () => {
    const config = loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY });

    expect(Object.keys(config).sort()).toEqual(
      ["allowedWidgetOrigins", "embedIpRateLimit", "embedKeyRateLimit", "port", "redisUrl", "sessionSigningKey", "sessionTtlSeconds", "tenants"].sort(),
    );
  });
});
