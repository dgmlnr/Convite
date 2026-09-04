import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { TenantRecord } from "./tenant-auth.js";
import { connectPostgres } from "./postgres-client.js";
import { createPostgresTenantRepository } from "./postgres-tenant-repository.js";
import { describeTenantRepositoryContract } from "./tenant-repository.contract.js";
import { readPostgresTestUrl } from "./postgres-test-harness.js";

/**
 * Runs the SAME conformance suite `tenant-auth.test.ts` runs against the
 * static in-memory adapter (design §1's Domain B), here against a real
 * Postgres 17 with migration 001 already applied
 * (`postgres-tests/global-setup.ts`). `pool` connects with the same
 * superuser-equivalent test URL `postgres-migrations.postgres.test.ts` uses
 * — this suite needs to INSERT directly (no write port exists yet, PR5), not
 * exercise `convite_readonly`'s narrower grant.
 *
 * `seedTenants` TRUNCATEs before every `create()` call: the shared contract
 * reuses the SAME embed key ("pk_live_t_a") across its own `it` blocks,
 * which would collide with `tenants.embed_key`'s UNIQUE constraint on a
 * table that persists across tests — the static adapter needs no equivalent
 * because each of its own `create()` calls is a fresh, unshared `Map`.
 * Parameterized queries only, never string interpolation — the discipline
 * PR5's write side will also need, paid early because this is the first
 * place raw SQL in this package touches tenant-shaped data.
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

describeTenantRepositoryContract("postgres", async (records) => {
  await seedTenants(records);
  return createPostgresTenantRepository(pool);
});

describe('createPostgresTenantRepository — request-time query failure (design §1.10: "undefined" means "no such tenant", never "the database could not answer")', () => {
  it("rejects rather than resolving to undefined when the query itself fails", async () => {
    // A real, unmocked failure: connect for real, then end the pool before
    // querying it. Distinct from every OTHER case in this file, which all
    // resolve to a value (a record, or undefined for a genuinely absent
    // one) — this one must reject instead, or a database outage would look
    // identical to a tenant that was simply never created.
    const brokenPool = await connectPostgres(readPostgresTestUrl());
    await brokenPool.end();
    const repo = createPostgresTenantRepository(brokenPool);

    await expect(repo.findByEmbedKey("pk_live_t_a")).rejects.toThrow();
    await expect(repo.findById("tenant-a" as TenantRecord["id"])).rejects.toThrow();
  });
});
