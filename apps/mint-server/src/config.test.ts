import { describe, expect, it } from "vitest";

import { loadMintConfig } from "./config.js";

const KEY = "oUW9QPNCc-C-rkyKCakJbggyhW2quFy4Kv98Pyd7MeI";
/** Every test not specifically exercising the `postgresUrl` guard itself
 * needs a value for it too, now that it fails closed by default — the same
 * reason `DEV_OPT_IN` exists on the match role's own `config.test.ts`. */
const PG_URL = { HEXDEV_POSTGRES_URL: "postgres://user:pw@db.example/convite" };

/**
 * This role is the ONLY one that holds the Ed25519 seed, which is the entire
 * point of splitting it out. Its config guards therefore matter more than the
 * match role's, not less: a mint process that boots with a dev default in
 * production would hand the whole fleet's blast radius straight back.
 */
describe("loadMintConfig", () => {
  it("reads the signing key it is given", () => {
    expect(loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, ...PG_URL }).sessionSigningKey).toBe(KEY);
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
    expect(loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: "not-a-real-key", ...PG_URL }).sessionSigningKey).toBe("not-a-real-key");
  });

  it("defaults the widget origin to its own port, and honours a configured list", () => {
    expect(loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, PORT: "4000", ...PG_URL }).allowedWidgetOrigins).toEqual(["http://localhost:4000"]);
    expect(
      loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_WIDGET_ORIGIN: "https://a.example,https://b.example", ...PG_URL }).allowedWidgetOrigins,
    ).toEqual(["https://a.example", "https://b.example"]);
  });

  /**
   * tenant-administration slice 3b: this role's tenant catalog no longer
   * comes from `HEXDEV_TENANTS_JSON`/`DEV_TENANT` at all — both retire in
   * this slice. `postgresUrl` joins the `sessionSigningKey` INVERTED-GUARD
   * family (design §1.8), deliberately NOT the optional `redisUrl` shape:
   * Postgres is the system of record, so an unset value must fail closed at
   * boot, the same "throw, crash boot" convention the signing-key guard
   * above already sets, never the silent in-memory fallback `redisUrl`
   * legitimately has.
   */
  describe("postgresUrl", () => {
    it("reads it from the environment when present", () => {
      const config = loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_POSTGRES_URL: "postgres://user:pw@db.example/convite" });
      expect(config.postgresUrl).toBe("postgres://user:pw@db.example/convite");
    });

    it("refuses to start in production without it", () => {
      expect(() => loadMintConfig({ NODE_ENV: "production", HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_ALLOW_DEV_DEFAULTS: "true" })).toThrow(/HEXDEV_POSTGRES_URL/);
    });

    it("refuses to start anywhere else without an explicit opt-in", () => {
      expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY })).toThrow(/HEXDEV_POSTGRES_URL/);
    });

    it("falls back to a local dev default only when opted into explicitly", () => {
      const config = loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_ALLOW_DEV_DEFAULTS: "true" });
      expect(config.postgresUrl).toMatch(/^postgres:\/\//);
    });

    /** The exact symptom this slice removes: setting the OLD variable must
     * no longer produce a tenant catalog, a config field, or a way to boot
     * without the new one — it is simply not read anymore. */
    it("ignores HEXDEV_TENANTS_JSON entirely — it is no longer read by this role", () => {
      const config = loadMintConfig({
        HEXDEV_SESSION_SIGNING_KEY: KEY,
        HEXDEV_POSTGRES_URL: "postgres://user:pw@db.example/convite",
        HEXDEV_TENANTS_JSON: "not even valid JSON, and that must not matter anymore",
      });
      expect(config).not.toHaveProperty("tenants");
      expect(config.postgresUrl).toBe("postgres://user:pw@db.example/convite");
    });
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
      expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, PORT: "not-a-port", ...PG_URL })).toThrow(/PORT/);
    });

    it("refuses a non-positive or absurd PORT", () => {
      expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, PORT: "0", ...PG_URL })).toThrow(/PORT/);
      expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, PORT: "70000", ...PG_URL })).toThrow(/PORT/);
    });

    it("refuses a non-numeric rate limit, naming the variable", () => {
      expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_EMBED_IP_RATE_LIMIT: "lots", ...PG_URL })).toThrow(/HEXDEV_EMBED_IP_RATE_LIMIT/);
      expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_EMBED_KEY_RATE_LIMIT: "lots", ...PG_URL })).toThrow(/HEXDEV_EMBED_KEY_RATE_LIMIT/);
    });

    it("refuses a non-numeric rate window, naming the variable", () => {
      expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_EMBED_IP_RATE_WINDOW_MS: "soon", ...PG_URL })).toThrow(/HEXDEV_EMBED_IP_RATE_WINDOW_MS/);
    });

    /** A limit of zero would lock every legitimate visitor out silently. */
    it("refuses a non-positive rate limit", () => {
      expect(() => loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, HEXDEV_EMBED_IP_RATE_LIMIT: "0", ...PG_URL })).toThrow(/HEXDEV_EMBED_IP_RATE_LIMIT/);
    });

    it("still accepts a well-formed one", () => {
      const config = loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, PORT: "4000", HEXDEV_EMBED_IP_RATE_LIMIT: "5", ...PG_URL });

      expect(config.port).toBe(4000);
      expect(config.embedIpRateLimit.limit).toBe(5);
    });
  });

  /**
   * The mint role does NOT carry the match role's knobs. Naming that here
   * keeps a future edit from quietly re-coupling the two configs.
   *
   * `tenants` is gone (tenant-administration slice 3b): the catalog now
   * lives in Postgres, read through `postgresUrl`, never through this
   * role's own env-parsed document.
   */
  it("carries only the front door's own concerns", () => {
    const config = loadMintConfig({ HEXDEV_SESSION_SIGNING_KEY: KEY, ...PG_URL });

    expect(Object.keys(config).sort()).toEqual(
      ["allowedWidgetOrigins", "embedIpRateLimit", "embedKeyRateLimit", "port", "postgresUrl", "redisUrl", "sessionSigningKey", "sessionTtlSeconds"].sort(),
    );
  });
});
