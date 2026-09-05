import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import { connectPostgres } from "./postgres-client.js";
import { assertSchemaUpToDate, runMigrations } from "./postgres-migrations.js";
import { readPostgresTestUrl } from "./postgres-test-harness.js";

/**
 * `postgres-tests/global-setup.ts` already applied every migration once
 * (`pnpm run db:migrate`, per design §14's "who calls it" table) before this
 * file runs. This suite proves two DIFFERENT things about that runner: that
 * migration 001 genuinely landed (the table and both roles exist, not just
 * "no error was thrown"), and that calling it again against the SAME,
 * already-migrated database is a no-op — the property that makes it safe for
 * `pnpm dev:server`, CI, and a developer's own laptop to all call it every
 * time without ever re-running an applied file.
 */
let pool: Pool;

beforeAll(async () => {
  pool = await connectPostgres(readPostgresTestUrl());
});

afterAll(async () => {
  await pool.end();
});

describe("runMigrations", () => {
  it("applied migration 001 — the tenants table and both roles exist, and the version is recorded", async () => {
    const table = await pool.query<{ reg: string | null }>("SELECT to_regclass('public.tenants')::text AS reg");
    expect(table.rows[0]?.reg).toBe("tenants");

    const roles = await pool.query<{ rolname: string }>(
      "SELECT rolname FROM pg_roles WHERE rolname IN ('convite_readonly', 'convite_admin') ORDER BY rolname",
    );
    expect(roles.rows.map((row) => row.rolname)).toEqual(["convite_admin", "convite_readonly"]);

    const version = await pool.query<{ version: string }>("SELECT version FROM schema_migrations WHERE version = '001_create_tenants_and_roles'");
    expect(version.rows).toHaveLength(1);
  });

  it("re-running the whole migration set against the already-migrated database applies nothing new", async () => {
    const applied = await runMigrations(pool);
    expect(applied).toEqual([]);
  });
});

/**
 * `assertSchemaUpToDate` (sdd-verify's own finding 3, design Part A §4/
 * Part B §15) — `apps/admin` boot must READ `schema_migrations` and crash
 * loudly if it is behind this package's own bundled migration set, never run
 * one itself. Proven with the EXACT `SET ROLE convite_admin` privilege
 * pattern `audit-entries.postgres.test.ts` already establishes: a role-
 * swapped session on the SAME physical connection, never a second `Pool`
 * dialed with that role's own (nonexistent) password — the identical reason
 * that file's own docstring gives.
 */
describe("assertSchemaUpToDate", () => {
  let adminClient: PoolClient;

  beforeAll(async () => {
    adminClient = await pool.connect();
    await adminClient.query("SET ROLE convite_admin");
  });

  afterAll(async () => {
    await adminClient.query("RESET ROLE");
    adminClient.release();
  });

  it("resolves silently through convite_admin's OWN real grant when the schema is current — proves the grant this fix adds actually works, not merely that the owner can read the table", async () => {
    await expect(assertSchemaUpToDate((sql) => adminClient.query(sql))).resolves.toBeUndefined();
  });

  it("throws naming BOTH the applied and the bundled version when the database is behind", async () => {
    // Deletes the TRAILING bundled migration's own row (005, since the
    // closure-batch fix added it) — the same "behind by exactly the last
    // one" shape the original version of this test asserted against 004,
    // before 005 existed. `latestApplied`/`latestBundled` are each computed
    // as the last element of a SORTED array (postgres-migrations.ts:55/:59),
    // so deleting anything other than the trailing version would make both
    // values coincide and stop demonstrating a mismatch at all.
    await pool.query("DELETE FROM schema_migrations WHERE version = '005_grant_schema_migrations_read'");
    try {
      await expect(assertSchemaUpToDate((sql) => pool.query(sql))).rejects.toThrow(
        /Latest applied migration: 004_create_audit_entries\. Latest bundled migration: 005_grant_schema_migrations_read\./,
      );
    } finally {
      await pool.query("INSERT INTO schema_migrations (version) VALUES ('005_grant_schema_migrations_read') ON CONFLICT (version) DO NOTHING");
    }
  });
});

/**
 * A closure-batch fix, and its own regression proof (sdd-verify obs #3763,
 * WARNING 2): migration 001 was edited AFTER being numbered to add
 * `GRANT SELECT ON schema_migrations TO convite_admin`. `runMigrations`
 * (:87 above) keys purely on VERSION MEMBERSHIP in `schema_migrations` —
 * `if (already.has(version)) continue` — never on file content, so that
 * grant would never reach a database that had already applied 001. The
 * grant now lives in its OWN migration, `005_grant_schema_migrations_read`.
 *
 * This test simulates the exact database an edited 001 would have left
 * behind: one where 001-004 already ran but 005 never did, and the grant
 * this fix depends on is therefore absent. It does so for REAL — deleting
 * migration 005's own recorded row and revoking its grant against the SAME
 * live Postgres every other test in this file runs against — then proves,
 * with a REAL `SET ROLE convite_admin` connection, that the boot check
 * genuinely fails with Postgres's own permission error, and that
 * `runMigrations` genuinely repairs it by applying the NEW file, never by
 * re-running 001 (001 stays absent from `applied` throughout).
 */
describe("the grant a numbered migration could not safely carry", () => {
  it("convite_admin cannot read schema_migrations until migration 005 applies, and re-running migrations is what fixes it — never 001", async () => {
    await pool.query("DELETE FROM schema_migrations WHERE version = '005_grant_schema_migrations_read'");
    await pool.query("REVOKE SELECT ON schema_migrations FROM convite_admin");

    const brokenClient = await pool.connect();
    try {
      await brokenClient.query("SET ROLE convite_admin");
      await expect(assertSchemaUpToDate((sql) => brokenClient.query(sql))).rejects.toThrow(/permission denied for table schema_migrations/);
    } finally {
      await brokenClient.query("RESET ROLE");
      brokenClient.release();
    }

    const applied = await runMigrations(pool);
    expect(applied).toEqual(["005_grant_schema_migrations_read"]);

    const fixedClient = await pool.connect();
    try {
      await fixedClient.query("SET ROLE convite_admin");
      await expect(assertSchemaUpToDate((sql) => fixedClient.query(sql))).resolves.toBeUndefined();
    } finally {
      await fixedClient.query("RESET ROLE");
      fixedClient.release();
    }
  });
});
