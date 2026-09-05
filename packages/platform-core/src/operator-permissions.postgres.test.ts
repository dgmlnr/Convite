import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { OperatorId } from "./operator-repository.js";
import { connectPostgres } from "./postgres-client.js";
import { findOperatorAuthorizationContext } from "./postgres-operator-authorization.js";
import { grantPermission, revokePermission } from "./operator-permissions.js";
import { readPostgresTestUrl } from "./postgres-test-harness.js";

/**
 * `grantPermission`/`revokePermission` (design §8's own advance note, spec
 * Domain K, tasks 12.1-12.7) — proven against REAL Postgres:
 * `revokePermission` shares `withLastAccountManagerGuard` with
 * `disableOperator` (`operator-lifecycle.postgres.test.ts`'s own proof), and
 * `grantPermission`'s own FK-violation mapping and transactional witness need
 * the real constraint/driver behavior no in-memory double can stand in for.
 *
 * THE TWO GENUINE RED PROBES BEHIND THIS FILE, run for real and reverted
 * (see `operator-permissions.ts`'s own docstrings for the exact wording each
 * probe left there): (1) `revokePermission` issued its `DELETE` directly
 * against `pool`, bypassing `withLastAccountManagerGuard` entirely — the
 * "two genuinely concurrent revocations" test below failed for real, both
 * transactions succeeding and leaving zero `operators.manage` holders; (2)
 * `grantPermission`'s witness ran through a second `pool.query` call instead
 * of the checked-out transactional `client` — the "witness rolls back the
 * grant" test below failed for real, the granted row surviving a witness
 * that threw. Both fixed to the code now on disk; both re-run green.
 */
let pool: Pool;

beforeAll(async () => {
  pool = await connectPostgres(readPostgresTestUrl());
});

afterAll(async () => {
  await pool.end();
});

async function resetOperators(): Promise<void> {
  await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
}

async function seedOperator(id: string): Promise<void> {
  await pool.query("INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3)", [id, `${id}-username`, "scrypt$32768$8$1$c2FsdA==$a2V5"]);
}

async function seedSession(operatorId: string, tokenHash: string): Promise<void> {
  await pool.query("INSERT INTO operator_sessions (token_hash, operator_id, created_at, expires_at) VALUES ($1, $2, now(), now() + interval '8 hours')", [tokenHash, operatorId]);
}

const noopWitness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => exec("SELECT 1", []);

describe("grantPermission — task 12.2", () => {
  it("grants a permission and records who granted it", async () => {
    await resetOperators();
    await seedOperator("op-grant-target");
    await seedOperator("op-grant-actor");

    const result = await grantPermission(pool, "op-grant-target" as OperatorId, "tenant.create", "op-grant-actor" as OperatorId, noopWitness);

    expect(result).toEqual({ ok: true });
    const { rows } = await pool.query<{ readonly permission: string; readonly granted_by: string }>(
      "SELECT permission, granted_by FROM operator_permissions WHERE operator_id = $1",
      ["op-grant-target"],
    );
    expect(rows).toEqual([{ permission: "tenant.create", granted_by: "op-grant-actor" }]);
  });

  it("a double grant is idempotent (operator_permissions' own composite PK) — no error, no second row", async () => {
    await resetOperators();
    await seedOperator("op-grant-target");
    await seedOperator("op-grant-actor");
    await grantPermission(pool, "op-grant-target" as OperatorId, "tenant.create", "op-grant-actor" as OperatorId, noopWitness);

    const second = await grantPermission(pool, "op-grant-target" as OperatorId, "tenant.create", "op-grant-actor" as OperatorId, noopWitness);

    expect(second).toEqual({ ok: true });
    const { rows } = await pool.query("SELECT 1 FROM operator_permissions WHERE operator_id = $1 AND permission = $2", ["op-grant-target", "tenant.create"]);
    expect(rows).toHaveLength(1);
  });

  it("refuses granting to an unknown operator, storing nothing, invoking no witness", async () => {
    await resetOperators();
    await seedOperator("op-grant-actor");
    let calls = 0;
    const witness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => {
      calls += 1;
      await exec("SELECT 1", []);
    };

    const result = await grantPermission(pool, "does-not-exist" as OperatorId, "tenant.create", "op-grant-actor" as OperatorId, witness);

    expect(result).toEqual({ ok: false, reason: "unknown-operator" });
    expect(calls).toBe(0);
    const { rows } = await pool.query("SELECT 1 FROM operator_permissions");
    expect(rows).toHaveLength(0);
  });

  it("a witness that throws rolls back the grant — GENUINE RED probed and reverted, see this file's own header", async () => {
    await resetOperators();
    await seedOperator("op-grant-witness-target");
    await seedOperator("op-grant-witness-actor");
    const throwingWitness = async () => {
      throw new Error("audit failure");
    };

    await expect(grantPermission(pool, "op-grant-witness-target" as OperatorId, "tenant.create", "op-grant-witness-actor" as OperatorId, throwingWitness)).rejects.toThrow("audit failure");

    const { rows } = await pool.query("SELECT 1 FROM operator_permissions WHERE operator_id = $1", ["op-grant-witness-target"]);
    expect(rows).toHaveLength(0); // rolled back, never partially committed
  });
});

describe("revokePermission — tasks 12.5/12.6", () => {
  it("revokes a granted permission", async () => {
    await resetOperators();
    await seedOperator("op-revoke-target");
    await pool.query("INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'tenant.create')", ["op-revoke-target"]);
    // An UNRELATED operators.manage holder — WITHOUT this, `resetOperators`
    // leaves the table-wide holder count at zero from the start, and the
    // guard's own post-mutation check (never a before/after DELTA, design
    // §8's own literal SQL) cannot tell "this mutation caused zero" from
    // "it was already zero" — refusing even a `tenant.create` revoke that
    // never touches `operators.manage` at all. The IDENTICAL genuine finding
    // `operator-lifecycle.postgres.test.ts`'s own docstring already
    // discloses for `disableOperator`, now hit for real by this test's first
    // version (failed with `{ok:false, reason:"last-account-manager"}`
    // before this seed line was added) — not a guard bug, since a real
    // deployment always has >=1 holder from bootstrap onward (design §12).
    await seedOperator("op-revoke-unrelated-holder");
    await pool.query("INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'operators.manage')", ["op-revoke-unrelated-holder"]);

    const result = await revokePermission(pool, "op-revoke-target" as OperatorId, "tenant.create", noopWitness);

    expect(result).toEqual({ ok: true });
    const { rows } = await pool.query("SELECT 1 FROM operator_permissions WHERE operator_id = $1", ["op-revoke-target"]);
    expect(rows).toHaveLength(0);
  });

  it("refuses revoking a permission that was never granted, invoking no witness", async () => {
    await resetOperators();
    await seedOperator("op-revoke-target");
    let calls = 0;
    const witness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => {
      calls += 1;
      await exec("SELECT 1", []);
    };

    const result = await revokePermission(pool, "op-revoke-target" as OperatorId, "tenant.create", witness);

    expect(result).toEqual({ ok: false, reason: "not-granted" });
    expect(calls).toBe(0);
  });

  it("refuses revoking the SOLE operators.manage holder's grant, leaving it in place (task 12.5, design §8 reused)", async () => {
    await resetOperators();
    await seedOperator("op-revoke-sole-holder");
    await pool.query("INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'operators.manage')", ["op-revoke-sole-holder"]);

    const result = await revokePermission(pool, "op-revoke-sole-holder" as OperatorId, "operators.manage", noopWitness);

    expect(result).toEqual({ ok: false, reason: "last-account-manager" });
    const { rows } = await pool.query("SELECT 1 FROM operator_permissions WHERE operator_id = $1 AND permission = 'operators.manage'", ["op-revoke-sole-holder"]);
    expect(rows).toHaveLength(1); // rolled back, still held
  });

  it("a SECOND holder makes revocation possible again (spec Domain K's own scenario)", async () => {
    await resetOperators();
    await seedOperator("op-revoke-first-holder");
    await seedOperator("op-revoke-second-holder");
    await pool.query(
      "INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'operators.manage'), ($2, 'operators.manage')",
      ["op-revoke-first-holder", "op-revoke-second-holder"],
    );

    const result = await revokePermission(pool, "op-revoke-first-holder" as OperatorId, "operators.manage", noopWitness);

    expect(result).toEqual({ ok: true });
  });

  it("a revoke of a DIFFERENT permission is never refused by the guard, even against the sole operators.manage holder (this module's own 'reuse regardless of which permission' argument)", async () => {
    await resetOperators();
    await seedOperator("op-revoke-unrelated");
    await pool.query(
      "INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'operators.manage'), ($1, 'tenant.create')",
      ["op-revoke-unrelated"],
    );

    const result = await revokePermission(pool, "op-revoke-unrelated" as OperatorId, "tenant.create", noopWitness);

    expect(result).toEqual({ ok: true }); // untouched operators.manage count, never refused
  });

  it("THE PROPERTY THIS SLICE MUST ESTABLISH: two GENUINELY CONCURRENT revocations of operators.manage, launched via Promise.all on two separate pool connections, never both succeed into zero holders — GENUINE RED probed and reverted, see this file's own header", async () => {
    await resetOperators();
    await seedOperator("op-race-a");
    await seedOperator("op-race-b");
    await pool.query(
      "INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'operators.manage'), ($2, 'operators.manage')",
      ["op-race-a", "op-race-b"],
    );

    const [first, second] = await Promise.all([
      revokePermission(pool, "op-race-a" as OperatorId, "operators.manage", noopWitness),
      revokePermission(pool, "op-race-b" as OperatorId, "operators.manage", noopWitness),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
    expect(outcomes.filter((o) => !o.ok)).toHaveLength(1);
    expect(outcomes.find((o) => !o.ok)).toMatchObject({ ok: false, reason: "last-account-manager" });

    const { rows } = await pool.query<{ readonly holders: number }>(
      "SELECT count(*)::int AS holders FROM operators o JOIN operator_permissions p ON p.operator_id = o.id WHERE o.enabled AND p.permission = 'operators.manage'",
    );
    expect(rows[0]!.holders).toBe(1);
  });
});

describe("grant/revoke propagate to authorize's own one-query join with no restart (tasks 12.3/12.4, design §7 no-cache)", () => {
  it("a granted permission is visible on the VERY NEXT authorization query", async () => {
    await resetOperators();
    await seedOperator("op-propagate");
    await seedSession("op-propagate", "op-propagate-token-hash");
    const before = await findOperatorAuthorizationContext(pool, "op-propagate-token-hash");
    expect(before?.permissions).toEqual([]);

    await grantPermission(pool, "op-propagate" as OperatorId, "tenant.window.edit", "op-propagate" as OperatorId, noopWitness);

    const after = await findOperatorAuthorizationContext(pool, "op-propagate-token-hash");
    expect(after?.permissions).toEqual(["tenant.window.edit"]);
  });

  it("a revoked permission disappears on the VERY NEXT query — the session itself is untouched, only the permission set shrinks", async () => {
    await resetOperators();
    await seedOperator("op-propagate-revoke");
    await seedSession("op-propagate-revoke", "op-propagate-revoke-token-hash");
    await pool.query("INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'tenant.window.edit')", ["op-propagate-revoke"]);
    // Same pre-existing-zero seed this file's own earlier test already
    // explains — this revoke targets `tenant.window.edit`, never
    // `operators.manage`, but the guard still needs a non-zero table-wide
    // count to compare against.
    await seedOperator("op-propagate-revoke-unrelated-holder");
    await pool.query("INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'operators.manage')", ["op-propagate-revoke-unrelated-holder"]);

    await revokePermission(pool, "op-propagate-revoke" as OperatorId, "tenant.window.edit", noopWitness);

    const after = await findOperatorAuthorizationContext(pool, "op-propagate-revoke-token-hash");
    expect(after?.permissions).toEqual([]);
    expect(after?.enabled).toBe(true); // the SESSION survives — only the permission is gone
  });
});
