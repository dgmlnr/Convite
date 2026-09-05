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
