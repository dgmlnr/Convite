import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { TenantId, TenantRecord } from "./tenant-auth.js";
import type { WriteWitness } from "./tenant-admin.js";
import { connectPostgres } from "./postgres-client.js";
import { createPostgresTenantAdminRepository } from "./postgres-tenant-admin-repository.js";
import { createPostgresTenantRepository } from "./postgres-tenant-repository.js";
import { describeTenantAdminRepositoryContract } from "./tenant-admin.contract.js";
import { readPostgresTestUrl } from "./postgres-test-harness.js";
import { isTenantActive } from "./tenant-validity.js";

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

/**
 * Task 15a.7 — "extending a lapsed tenant's window re-enables mint/renew/join
 * with no other change." Exercised end-to-end against REAL Postgres, across
 * BOTH sides of the read/write split (design §2.4, decision #3684 item 4):
 * the ADMIN write path (`TenantAdminRepository.setValidityWindow`, the exact
 * function `tenant-handlers.ts`'s `createTenantWindowHandler` calls) and the
 * MINT/MATCH read path (`TenantRepository.findByEmbedKey` +
 * `isTenantActive`, the exact two calls `resolveActiveTenant` in
 * `tenant-auth.ts` makes at every real choke point). Deliberately does NOT
 * boot `apps/mint-server` itself — that would duplicate what
 * `tenant-auth.test.ts`'s own choke-point suite already proves about
 * `isTenantActive`'s CALL SITE; this test's own job is proving the DATA
 * actually flows from one adapter to the other through the SAME row, which
 * neither adapter's own isolated contract test can show by itself.
 */
describe("task 15a.7 — extending a lapsed tenant's window through the admin write path re-enables it on the read path", () => {
  it("a tenant whose window already lapsed is inactive on read, then active again after the SAME admin extend the panel's own handler performs — origins/games untouched throughout", async () => {
    await seedTenants([]);
    const now = Date.now();
    const pastValidUntil = new Date(now - 24 * 60 * 60 * 1000); // 1 day ago — already lapsed
    await pool.query("INSERT INTO tenants (id, embed_key, allowed_origins, entitled_games, valid_until) VALUES ($1, $2, $3, $4, $5)", [
      "tenant-window-e2e",
      "pk_live_window_e2e",
      ["https://acme.example"],
      ["truco-argentino"],
      pastValidUntil,
    ]);

    const readRepo = createPostgresTenantRepository(pool);
    const adminRepo = createPostgresTenantAdminRepository(pool);

    // BEFORE: the exact read a real mint/renew/join choke point performs —
    // lapsed, so `resolveActiveTenant` would refuse it.
    const before = await readRepo.findByEmbedKey("pk_live_window_e2e");
    expect(before).not.toBeUndefined();
    expect(isTenantActive(before!, now)).toBe(false);

    // THE ADMIN EDIT — the SAME `setValidityWindow` call
    // `createTenantWindowHandler` makes, extending validUntil 90 days out,
    // `validFrom` carried through unchanged (undefined here, matching this
    // tenant's own — the handler's own "preserve, never silently clear"
    // rule, proven at the unit level in `tenant-handlers.test.ts`).
    const futureValidUntil = now + 90 * 24 * 60 * 60 * 1000;
    const witness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => exec("SELECT 1", []);
    const writeResult = await adminRepo.setValidityWindow("tenant-window-e2e" as TenantId, { validFrom: before!.validFrom, validUntil: futureValidUntil }, witness);
    expect(writeResult.ok).toBe(true);

    // AFTER: re-read through the SAME read port a real choke point uses —
    // now active, with NO OTHER FIELD disturbed by the window edit.
    const after = await readRepo.findByEmbedKey("pk_live_window_e2e");
    expect(after).not.toBeUndefined();
    expect(isTenantActive(after!, now)).toBe(true);
    expect(after!.allowedOrigins).toEqual(["https://acme.example"]);
    expect(after!.entitledGames).toEqual(["truco-argentino"]);
  });
});
