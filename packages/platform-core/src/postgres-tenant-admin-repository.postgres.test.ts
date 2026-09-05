import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { TenantId, TenantRecord } from "./tenant-auth.js";
import { connectPostgres } from "./postgres-client.js";
import { createPostgresTenantAdminRepository } from "./postgres-tenant-admin-repository.js";
import { describeTenantAdminRepositoryContract } from "./tenant-admin.contract.js";
import { readPostgresTestUrl } from "./postgres-test-harness.js";

/**
 * Runs the SAME conformance suite the static in-memory adapter runs
 * (`tenant-admin.test.ts`), here against real Postgres 17 with migration 001
 * already applied — mirrors `postgres-tenant-repository.postgres.test.ts`'s
 * own `pool`/`seedTenants`/`TRUNCATE` shape exactly, for the identical
 * reason: the shared contract reuses the same embed keys across its own `it`
 * blocks, which would collide with `tenants.embed_key`'s UNIQUE constraint on
 * a table that persists across tests.
 */
let pool: Pool;

beforeAll(async () => {
  pool = await connectPostgres(readPostgresTestUrl());
});

afterAll(async () => {
  await pool.end();
});

async function seedTenants(records: readonly TenantRecord[]): Promise<void> {
  await pool.query("TRUNCATE TABLE tenants");
  for (const record of records) {
    await pool.query("INSERT INTO tenants (id, embed_key, allowed_origins, entitled_games, theme) VALUES ($1, $2, $3, $4, $5)", [
      record.id,
      record.embedKey,
      record.allowedOrigins,
      record.entitledGames,
      record.theme === undefined ? null : JSON.stringify(record.theme),
    ]);
  }
}

describeTenantAdminRepositoryContract("postgres", async (records) => {
  await seedTenants(records);
  return createPostgresTenantAdminRepository(pool);
});

describe('createPostgresTenantAdminRepository — embedKey uniqueness: "the constraint enforces, the catch translates" (design §3, no TOCTOU check-then-write)', () => {
  it("refuses two concurrent creates racing for the SAME embedKey — the datastore's own constraint decides, not a pre-check", async () => {
    await seedTenants([]);
    const repo = createPostgresTenantAdminRepository(pool);
    const witness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => exec("x", []);
    const [first, second] = await Promise.all([
      repo.create({ id: "tenant-race-1" as TenantId, embedKey: "pk_live_race", allowedOrigins: [], entitledGames: [] }, witness),
      repo.create({ id: "tenant-race-2" as TenantId, embedKey: "pk_live_race", allowedOrigins: [], entitledGames: [] }, witness),
    ]);
    const outcomes = [first, second].map((r) => r.ok);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(outcomes.filter((ok) => !ok)).toHaveLength(1);
    expect((await repo.list())).toHaveLength(1);
  });
});

describe("createPostgresTenantAdminRepository — SQL injection (threat matrix: every write is pool.query(text, values), never string interpolation)", () => {
  it("a hostile allowedOrigins entry round-trips as literal data, never as executed SQL", async () => {
    await seedTenants([{ id: "tenant-inj" as TenantId, embedKey: "pk_live_inj", allowedOrigins: [], entitledGames: [] }]);
    const repo = createPostgresTenantAdminRepository(pool);
    const payload = "'); DROP TABLE tenants;--";
    const witness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => exec("x", []);

    const result = await repo.updateAllowedOrigins("tenant-inj" as TenantId, [payload], witness);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tenant.allowedOrigins).toEqual([payload]);
    // The real proof: `tenants` still exists and is still queryable at all —
    // a naive string-built query executing the payload would have dropped it.
    const { rows } = await pool.query<{ readonly allowed_origins: readonly string[] }>("SELECT allowed_origins FROM tenants WHERE id = $1", ["tenant-inj"]);
    expect(rows[0]?.allowed_origins).toEqual([payload]);
  });
});
