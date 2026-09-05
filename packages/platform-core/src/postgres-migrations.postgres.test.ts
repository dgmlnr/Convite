import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { connectPostgres } from "./postgres-client.js";
import { runMigrations } from "./postgres-migrations.js";
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
