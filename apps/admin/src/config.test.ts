import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadAdminConfig } from "./config.js";

/**
 * `postgresUrl` joins the `sessionSigningKey`/`sessionPublicKey` INVERTED-
 * GUARD family (design §1.8, decisions #3684) — deliberately NOT the
 * optional `redisUrl` shape mint-server/server both also carry. Postgres is
 * the system of record for THIS app too: an unset value must fail closed at
 * boot, never fall back to an empty in-memory catalog that silently serves
 * nobody. Same "throw, crash boot" convention `loadMintConfig`/
 * `loadServerConfig` already establish, reused rather than reinvented.
 */
describe("loadAdminConfig", () => {
  describe("without HEXDEV_POSTGRES_URL", () => {
    it("refuses to start in production", () => {
      expect(() => loadAdminConfig({ NODE_ENV: "production" })).toThrow(/HEXDEV_POSTGRES_URL/);
    });

    it("refuses to start anywhere else without an explicit opt-in", () => {
      expect(() => loadAdminConfig({})).toThrow(/HEXDEV_ALLOW_DEV_DEFAULTS/);
      expect(() => loadAdminConfig({ NODE_ENV: "staging" })).toThrow(/HEXDEV_ALLOW_DEV_DEFAULTS/);
    });

    it("allows the dev default only when opted into explicitly", () => {
      expect(loadAdminConfig({ HEXDEV_ALLOW_DEV_DEFAULTS: "true" }).postgresUrl).toMatch(/^postgres:\/\//);
    });

    /** Even the explicit opt-in loses to a real production NODE_ENV — the
     * same precedence `loadMintConfig`'s own guard already fixes. */
    it("still refuses in production even with the opt-in set", () => {
      expect(() => loadAdminConfig({ NODE_ENV: "production", HEXDEV_ALLOW_DEV_DEFAULTS: "true" })).toThrow(/production/);
    });
  });

  it("reads HEXDEV_POSTGRES_URL from the environment when present", () => {
    expect(loadAdminConfig({ HEXDEV_POSTGRES_URL: "postgres://user:pw@db.example/convite" }).postgresUrl).toBe(
      "postgres://user:pw@db.example/convite",
    );
  });

  it("defaults the port and honours PORT when set", () => {
    const pgUrl = { HEXDEV_POSTGRES_URL: "postgres://user:pw@db.example/convite" };
    expect(loadAdminConfig(pgUrl).port).toBeGreaterThan(0);
    expect(loadAdminConfig({ ...pgUrl, PORT: "9000" }).port).toBe(9000);
  });

  /**
   * `selfOrigin` (design §11.2's CSRF check, tasks 8b.5/8b.6): the panel's
   * OWN origin, the value every non-GET request's Origin/Referer is compared
   * against (`csrf.ts`). Defaults relative to the resolved port — same shape
   * `loadMintConfig`'s own `allowedWidgetOrigins` default already takes
   * (`http://localhost:${port}`) — so a fresh `pnpm dev:server` checkout
   * never needs an extra env var just to make its own CSRF check pass
   * against itself.
   */
  describe("selfOrigin", () => {
    const pgUrl = { HEXDEV_POSTGRES_URL: "postgres://user:pw@db.example/convite" };

    it("defaults to http://localhost:<resolved port>", () => {
      expect(loadAdminConfig({ ...pgUrl, PORT: "9000" }).selfOrigin).toBe("http://localhost:9000");
    });

    it("honours HEXDEV_ADMIN_ORIGIN when set", () => {
      expect(loadAdminConfig({ ...pgUrl, HEXDEV_ADMIN_ORIGIN: "https://admin.example.com" }).selfOrigin).toBe("https://admin.example.com");
    });
  });

  /**
   * `cookieSecure` (design §11.2): `Secure` is droppable ONLY through the
   * existing `HEXDEV_ALLOW_DEV_DEFAULTS` opt-in — never a bare default, and
   * never independent of the SAME opt-in `postgresUrl`'s own guard already
   * reads, so there is exactly one flag in this app that means "I know this
   * is a local, insecure dev run."
   */
  /**
   * design §11.3: two independent `RateLimitConfig` knobs — by username and
   * by IP — same shape mint-server's own `embedIpRateLimit`/
   * `embedKeyRateLimit` already establish. Suggested budgets from design's
   * own table: 5/15min by username, 20/15min by IP.
   */
  describe("login rate limits", () => {
    const pgUrl = { HEXDEV_POSTGRES_URL: "postgres://user:pw@db.example/convite" };

    it("defaults to design §11.3's suggested budgets (5/window by username, 20/window by IP)", () => {
      const config = loadAdminConfig(pgUrl);
      expect(config.loginUserRateLimit.limit).toBe(5);
      expect(config.loginIpRateLimit.limit).toBe(20);
      expect(config.loginUserRateLimit.windowMs).toBe(config.loginIpRateLimit.windowMs);
    });

    it("honours explicit env overrides", () => {
      const config = loadAdminConfig({ ...pgUrl, HEXDEV_ADMIN_LOGIN_USER_RATE_LIMIT: "3", HEXDEV_ADMIN_LOGIN_IP_RATE_LIMIT: "7" });
      expect(config.loginUserRateLimit.limit).toBe(3);
      expect(config.loginIpRateLimit.limit).toBe(7);
    });
  });

  describe("redisUrl", () => {
    it("is undefined unless HEXDEV_REDIS_URL is set (in-memory rate limiting by default, single-instance panel)", () => {
      expect(loadAdminConfig({ HEXDEV_POSTGRES_URL: "postgres://user:pw@db.example/convite" }).redisUrl).toBeUndefined();
    });

    it("reads HEXDEV_REDIS_URL when set", () => {
      expect(loadAdminConfig({ HEXDEV_POSTGRES_URL: "postgres://user:pw@db.example/convite", HEXDEV_REDIS_URL: "redis://localhost:6379" }).redisUrl).toBe("redis://localhost:6379");
    });
  });

  describe("cookieSecure", () => {
    it("is true by default (and in production)", () => {
      expect(loadAdminConfig({ HEXDEV_POSTGRES_URL: "postgres://user:pw@db.example/convite" }).cookieSecure).toBe(true);
    });

    it("is false only when HEXDEV_ALLOW_DEV_DEFAULTS is explicitly set", () => {
      expect(loadAdminConfig({ HEXDEV_ALLOW_DEV_DEFAULTS: "true" }).cookieSecure).toBe(false);
    });

    it("stays true in production even if HEXDEV_ALLOW_DEV_DEFAULTS were somehow set (defence in depth, mirrors the postgresUrl guard's own precedence)", () => {
      // NODE_ENV=production always throws before this field would even be
      // read (see the "still refuses in production" test above) — this
      // documents the property rather than exercising an unreachable branch.
      expect(() => loadAdminConfig({ NODE_ENV: "production", HEXDEV_ALLOW_DEV_DEFAULTS: "true" })).toThrow();
    });
  });

  /**
   * Task 7.3's own requirement, made mechanical rather than left as a claim
   * nobody checks: `apps/admin` MUST NOT hold the Ed25519 signing seed
   * (design §6, decisions #3684 — "apps/admin must NOT hold the Ed25519
   * signing seed, and must be structurally incapable of minting"). Scanning
   * THIS file's own source text is the narrowest true reading of task 7.3's
   * wording ("no Ed25519 seed variable exists anywhere in THIS APP'S
   * CONFIG"); `no-signing-seed.test.ts` extends the identical technique
   * across the whole app, matching `scripts/composition-root-least-
   * privilege.test.ts`'s existing precedent for the analogous claim about
   * mint-server/server never reaching `TenantAdminRepository`.
   *
   * Genuine RED reconstructed before this file settled: with a
   * `sessionSigningKey` field temporarily added to `config.ts`, this
   * assertion failed for real (`expected string not to contain
   * "sessionSigningKey"`) before the field was removed again.
   */
  it("never references the Ed25519 signing seed VARIABLE anywhere in its own source", () => {
    // Scoped to the two identifiers a config that DID hold the seed would
    // actually declare — never the word "Ed25519" itself, which this file's
    // own docstring is free to use when explaining the omission in prose.
    const source = readFileSync(fileURLToPath(new URL("./config.ts", import.meta.url)), "utf8");
    expect(source).not.toContain("HEXDEV_SESSION_SIGNING_KEY");
    expect(source).not.toContain("sessionSigningKey");
  });
});
