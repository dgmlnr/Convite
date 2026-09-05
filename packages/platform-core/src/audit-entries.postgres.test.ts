import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import { connectPostgres } from "./postgres-client.js";
import { readPostgresTestUrl } from "./postgres-test-harness.js";

/**
 * Proves migration 004's append-only enforcement (design §9, tasks
 * 10.2/10.3, threat matrix row "Audit tampering") against a REAL Postgres —
 * not by reading the migration file, by actually connecting as each role
 * and watching the database refuse.
 *
 * TWO SEPARATE CASES, deliberately isolated from each other (design §9's own
 * two-layer table): a privilege check happens BEFORE a trigger ever fires,
 * so testing them against the SAME connection would only ever exercise
 * whichever layer comes first and never prove the second exists at all.
 *
 *   LAYER 1 (privilege) — the SAME physical connection as the owner, after
 *   `SET ROLE convite_admin` (the exact role `apps/admin` and the bootstrap
 *   CLI hold), attempts UPDATE/DELETE. This must fail with a Postgres
 *   PRIVILEGE error, before the trigger is ever reached.
 *
 *   LAYER 2 (constraint) — the OWNER connection (`ownerPool` below, the
 *   same superuser-equivalent test URL every other `*.postgres.test.ts`
 *   file uses) attempts UPDATE/DELETE. The owner's privilege check
 *   trivially passes — table ownership bypasses every GRANT — so a failure
 *   here can ONLY come from the trigger, isolating it from layer 1 entirely.
 *
 * `SET ROLE`, NOT a second TCP connection under a different username —
 * caught for real, not assumed: this file's first revision opened a second
 * `Pool` via a role-swapped connection URL (`postgres://convite_admin@...`)
 * and passed locally while FAILING IN CI with `password authentication
 * failed for user "convite_admin"` (SQLSTATE 28P01). Root cause:
 * `convite_admin`/`convite_readonly` are created by migration 001 with NO
 * PASSWORD (`CREATE ROLE ... LOGIN;`, nothing more — a real deployment sets
 * one out-of-band). This harness's LOCAL Docker container runs
 * `POSTGRES_HOST_AUTH_METHOD=trust` (`postgres-tests/global-setup.ts`), so a
 * fresh connection as any role with no password succeeds locally. CI's own
 * Postgres SERVICE CONTAINER (`.github/workflows/ci.yml`) does NOT set that
 * — it only configures `POSTGRES_USER`/`POSTGRES_PASSWORD` for the owner —
 * so its default `pg_hba.conf` demands `scram-sha-256` for every host
 * connection, including one attempted as `convite_admin`, which can never
 * succeed against a role with no password set at all. `SET ROLE` sidesteps
 * the whole authentication path: it only requires the ALREADY-AUTHENTICATED
 * session's own role (the owner, always a superuser in this harness) to be
 * permitted to become the target role — which a superuser always is,
 * regardless of that role's own password (or lack of one) — so it works
 * identically against local Docker and CI's service container.
 */
let ownerPool: Pool;
let adminClient: PoolClient;
const SEED_OPERATOR_ID = "op-audit-entries-fence";

beforeAll(async () => {
  ownerPool = await connectPostgres(readPostgresTestUrl());
  await ownerPool.query("INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [
    SEED_OPERATOR_ID,
    "audit-entries-fence-operator",
    "scrypt$32768$8$1$c2FsdA==$a2V5",
  ]);
  // A DEDICATED client, checked out ONCE and held for this whole file's
  // run: `SET ROLE` changes only the CURRENT session, so applying it
  // through `ownerPool.query(...)`'s own convenience method (which may
  // check out a DIFFERENT client per call, from the pool's own internal
  // rotation) would land on whichever physical connection happened to be
  // picked, not reliably on "the" admin connection every case below needs.
  adminClient = await ownerPool.connect();
  await adminClient.query("SET ROLE convite_admin");
});

afterAll(async () => {
  await adminClient.query("RESET ROLE");
  adminClient.release();
  await ownerPool.end();
});

/** A single row every case reuses — inserted fresh per `it` block as the
 * OWNER (never through `adminClient`, so a failing INSERT is never mistaken
 * for the thing under test) so an earlier case's refused UPDATE/DELETE can
 * never leave a stray committed mutation for a later case to trip over. */
async function seedOneEntry(): Promise<number> {
  const { rows } = await ownerPool.query<{ id: number }>(
    "INSERT INTO audit_entries (occurred_at, actor_operator_id, actor_username, action, target_tenant_id) VALUES (now(), $1, $2, $3, $4) RETURNING id",
    [SEED_OPERATOR_ID, "audit-entries-fence-operator", "tenant.created", "tenant-audit-fence"],
  );
  return rows[0]!.id;
}

describe("audit_entries append-only enforcement, layer 1: privilege (convite_admin has no UPDATE/DELETE grant at all)", () => {
  it("an UPDATE issued as convite_admin fails with a privilege error", async () => {
    const id = await seedOneEntry();
    await expect(adminClient.query("UPDATE audit_entries SET action = 'tampered' WHERE id = $1", [id])).rejects.toThrow(/permission denied/i);
  });

  it("a DELETE issued as convite_admin fails with a privilege error", async () => {
    const id = await seedOneEntry();
    await expect(adminClient.query("DELETE FROM audit_entries WHERE id = $1", [id])).rejects.toThrow(/permission denied/i);
  });

  it("convite_admin CAN still insert — the grant is SELECT+INSERT only, never a blanket refusal", async () => {
    // `id bigserial` round-trips through `pg` as a STRING (int8 exceeds
    // JS's safe integer range in general, so node-postgres never silently
    // narrows it) — `Number(...)` here is only for this assertion's own
    // convenience, never how a real caller should treat the column.
    const id = await adminClient
      .query<{ id: string }>("INSERT INTO audit_entries (occurred_at, actor_operator_id, actor_username, action) VALUES (now(), $1, $2, $3) RETURNING id", [
        SEED_OPERATOR_ID,
        "audit-entries-fence-operator",
        "session.login",
      ])
      .then((result) => result.rows[0]!.id);
    expect(Number(id)).toBeGreaterThan(0);
  });
});

describe("audit_entries append-only enforcement, layer 2: the trigger, isolated from layer 1 by running as the OWNER (whose privilege check trivially passes)", () => {
  it("an UPDATE issued as the owner still fails — the trigger, not a privilege check, refuses it", async () => {
    const id = await seedOneEntry();
    await expect(ownerPool.query("UPDATE audit_entries SET action = 'tampered' WHERE id = $1", [id])).rejects.toThrow(/append-only/i);
  });

  it("a DELETE issued as the owner still fails — the trigger, not a privilege check, refuses it", async () => {
    const id = await seedOneEntry();
    await expect(ownerPool.query("DELETE FROM audit_entries WHERE id = $1", [id])).rejects.toThrow(/append-only/i);
  });
});
