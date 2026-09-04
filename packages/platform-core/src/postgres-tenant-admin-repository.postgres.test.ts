import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { TenantId, TenantRecord } from "./tenant-auth.js";
import type { WriteWitness } from "./tenant-admin.js";
import { connectPostgres } from "./postgres-client.js";
import { createPostgresTenantAdminRepository } from "./postgres-tenant-admin-repository.js";
import { describeTenantAdminRepositoryContract } from "./tenant-admin.contract.js";
import { readPostgresTestUrl } from "./postgres-test-harness.js";

/** An operator row every audit-witness test in this file's own "task 10.6"
 * describe block references — `audit_entries.actor_operator_id` is `NOT
 * NULL REFERENCES operators(id)` (migration 004), so a witness that really
 * inserts a row needs a real operator to attribute it to. Seeded once,
 * never truncated by this file (only `tenants` is), since no other suite in
 * this file touches `operators`. */
const AUDIT_TEST_OPERATOR_ID = "op-tenant-admin-audit-mechanism-test";

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
  await pool.query("INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [
    AUDIT_TEST_OPERATOR_ID,
    "tenant-admin-audit-mechanism-test-operator",
    "scrypt$32768$8$1$c2FsdA==$a2V5",
  ]);
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
    // "SELECT 1", not "x": task 10.6 makes the postgres adapter run this
    // witness's `exec` for REAL, inside the mutation's own transaction — a
    // placeholder SQL string that used to be swallowed by a no-op `exec`
    // (pre-PR12) would now be an actual syntax error against Postgres.
    const witness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => exec("SELECT 1", []);
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
    // "SELECT 1", not "x": task 10.6 makes the postgres adapter run this
    // witness's `exec` for REAL, inside the mutation's own transaction — a
    // placeholder SQL string that used to be swallowed by a no-op `exec`
    // (pre-PR12) would now be an actual syntax error against Postgres.
    const witness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => exec("SELECT 1", []);

    const result = await repo.updateAllowedOrigins("tenant-inj" as TenantId, [payload], witness);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tenant.allowedOrigins).toEqual([payload]);
    // The real proof: `tenants` still exists and is still queryable at all —
    // a naive string-built query executing the payload would have dropped it.
    const { rows } = await pool.query<{ readonly allowed_origins: readonly string[] }>("SELECT allowed_origins FROM tenants WHERE id = $1", ["tenant-inj"]);
    expect(rows[0]?.allowed_origins).toEqual([payload]);
  });
});

describe("createPostgresTenantAdminRepository — task 10.6: the REAL WriteWitness runs INSIDE the mutation's own transaction, closing the slice 4 -> 10 back-edge", () => {
  /** Builds a witness that performs a REAL `audit_entries` INSERT through
   * `exec` — not a counter, not `NOOP_EXEC` — so these tests prove the
   * transactional coupling against an ACTUAL second table, the same
   * mechanism `apps/admin/src/audit-log.ts`'s own `appendAuditEntry` will
   * exercise once a real route handler builds a `WriteWitness` this way
   * (slices 11+). Deliberately does NOT import `audit-log.ts` itself: that
   * module lives in `apps/admin` (an L3 app), and `platform-core` (L1) must
   * never depend on it even from a test file — this witness only needs the
   * TABLE `audit_entries`, not the app-side module that will eventually
   * write to it in production. `throwAfterInsert` lets a single builder
   * serve both the commit-direction and rollback-direction proofs below. */
  function realAuditWitness(targetTenantId: string, options?: { readonly throwAfterInsert?: boolean }): WriteWitness {
    return async (exec) => {
      await exec(
        "INSERT INTO audit_entries (occurred_at, actor_operator_id, actor_username, action, target_tenant_id) VALUES (now(), $1, $2, $3, $4)",
        [AUDIT_TEST_OPERATOR_ID, "tenant-admin-audit-mechanism-test-operator", "tenant.created", targetTenantId],
      );
      if (options?.throwAfterInsert === true) throw new Error("simulated audit-writer bug — must roll the tenant mutation back too");
    };
  }

  it("a witness's real audit INSERT commits ATOMICALLY with the tenant mutation it accompanies — both rows exist after COMMIT, proving a mutation is never left without its audit entry", async () => {
    await seedTenants([]);
    const repo = createPostgresTenantAdminRepository(pool);

    const result = await repo.create(
      { id: "tenant-audit-commit" as TenantId, embedKey: "pk_live_audit_commit", allowedOrigins: [], entitledGames: [] },
      realAuditWitness("tenant-audit-commit"),
    );

    expect(result.ok).toBe(true);
    expect(await repo.findById("tenant-audit-commit" as TenantId)).not.toBeUndefined();
    const { rows } = await pool.query<{ readonly action: string }>("SELECT action FROM audit_entries WHERE target_tenant_id = $1", ["tenant-audit-commit"]);
    expect(rows).toEqual([{ action: "tenant.created" }]);
  });

  it("a witness that performs its real audit INSERT and THEN throws rolls BOTH back — no tenant row, no audit row, proving an audit entry is never left for a mutation that did not commit", async () => {
    await seedTenants([]);
    const repo = createPostgresTenantAdminRepository(pool);

    await expect(
      repo.create(
        { id: "tenant-audit-rollback" as TenantId, embedKey: "pk_live_audit_rollback", allowedOrigins: [], entitledGames: [] },
        realAuditWitness("tenant-audit-rollback", { throwAfterInsert: true }),
      ),
    ).rejects.toThrow("simulated audit-writer bug");

    expect(await repo.findById("tenant-audit-rollback" as TenantId)).toBeUndefined();
    const { rows } = await pool.query("SELECT 1 FROM audit_entries WHERE target_tenant_id = $1", ["tenant-audit-rollback"]);
    expect(rows).toHaveLength(0);
  });

  it("a REFUSED write never invokes the witness at all, proven against Postgres rather than an in-memory counter: a real audit-insert witness leaves audit_entries untouched by a duplicate-embedKey refusal", async () => {
    await seedTenants([{ id: "tenant-audit-refuse-existing" as TenantId, embedKey: "pk_live_audit_refuse", allowedOrigins: [], entitledGames: [] }]);
    const repo = createPostgresTenantAdminRepository(pool);

    const result = await repo.create(
      { id: "tenant-audit-refuse-dup" as TenantId, embedKey: "pk_live_audit_refuse", allowedOrigins: [], entitledGames: [] },
      realAuditWitness("tenant-audit-refuse-dup"),
    );

    expect(result).toEqual({ ok: false, reason: "embed-key-taken" });
    const { rows } = await pool.query("SELECT 1 FROM audit_entries WHERE target_tenant_id = $1", ["tenant-audit-refuse-dup"]);
    expect(rows).toHaveLength(0);
  });
});
