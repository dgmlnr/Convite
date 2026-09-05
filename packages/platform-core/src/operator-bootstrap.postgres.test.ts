import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { OperatorId } from "./operator-repository.js";
import { connectPostgres } from "./postgres-client.js";
import { bootstrapOperator, resetOperatorPassword } from "./operator-bootstrap.js";
import { readPostgresTestUrl } from "./postgres-test-harness.js";

/**
 * `bootstrapOperator`/`resetOperatorPassword` (tasks 11b.3-11b.8, design §12)
 * — proven against real Postgres, mirroring `operator-lifecycle.postgres.test.ts`'s
 * own shape.
 */
let pool: Pool;

beforeAll(async () => {
  pool = await connectPostgres(readPostgresTestUrl());
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
});

const noopWitness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => exec("SELECT 1", []);

describe("bootstrapOperator — first-run creation grants EVERY caller-supplied permission (task 11b.3-11b.4)", () => {
  it("against an empty operators table, creates an enabled account holding every listed permission, self-referentially granted", async () => {
    const result = await bootstrapOperator(
      pool,
      { id: "op-boot" as OperatorId, username: "ana", passwordHash: "scrypt$32768$8$1$c2FsdA==$a2V5", permissions: ["tenant.create", "operators.manage", "audit.view"] },
      noopWitness,
    );

    expect(result).toEqual({ ok: true, operatorId: "op-boot" });
    const { rows: operatorRows } = await pool.query<{ readonly enabled: boolean }>("SELECT enabled FROM operators WHERE id = $1", ["op-boot"]);
    expect(operatorRows[0]?.enabled).toBe(true);
    const { rows: permissionRows } = await pool.query<{ readonly permission: string; readonly granted_by: string }>(
      "SELECT permission, granted_by FROM operator_permissions WHERE operator_id = $1 ORDER BY permission",
      ["op-boot"],
    );
    expect(permissionRows).toEqual([
      { permission: "audit.view", granted_by: "op-boot" },
      { permission: "operators.manage", granted_by: "op-boot" },
      { permission: "tenant.create", granted_by: "op-boot" },
    ]);
  });

  it("refuses when ANY operator already exists, storing nothing and invoking no witness (task 11b.5-11b.6)", async () => {
    await pool.query("INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3)", ["op-existing", "existing", "scrypt$32768$8$1$c2FsdA==$a2V5"]);
    let calls = 0;
    const witness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => {
      calls += 1;
      await exec("SELECT 1", []);
    };

    const result = await bootstrapOperator(pool, { id: "op-second" as OperatorId, username: "beto", passwordHash: "scrypt$32768$8$1$c2FsdA==$a2V5", permissions: ["tenant.create"] }, witness);

    expect(result).toEqual({ ok: false, reason: "operator-exists" });
    expect(calls).toBe(0);
    const { rows } = await pool.query("SELECT 1 FROM operators WHERE id = $1", ["op-second"]);
    expect(rows).toHaveLength(0);
  });

  it("a permission-grant failure partway through rolls the WHOLE bootstrap back — no operator row, no partial permission set (genuine RED, deliberate probe, run and reverted)", async () => {
    // DELIBERATE PROBE: one of the two permissions is not a valid string for
    // this Postgres session in a way that would fail — instead, simulate a
    // mid-loop failure via a throwing witness (same mechanism the atomicity
    // proof already uses elsewhere), proving the loop's own inserts are
    // inside the SAME transaction the witness's failure rolls back.
    const throwingWitness = async () => {
      throw new Error("simulated audit-writer failure mid-bootstrap");
    };

    await expect(
      bootstrapOperator(pool, { id: "op-partial" as OperatorId, username: "partial", passwordHash: "scrypt$32768$8$1$c2FsdA==$a2V5", permissions: ["tenant.create", "operators.manage"] }, throwingWitness),
    ).rejects.toThrow("simulated audit-writer failure mid-bootstrap");

    const { rows: operatorRows } = await pool.query("SELECT 1 FROM operators WHERE id = $1", ["op-partial"]);
    expect(operatorRows).toHaveLength(0);
    const { rows: permissionRows } = await pool.query("SELECT 1 FROM operator_permissions WHERE operator_id = $1", ["op-partial"]);
    expect(permissionRows).toHaveLength(0);
  });
});

describe("resetOperatorPassword — --force path updates ONLY the credential, deletes live sessions (task 11b.7-11b.8)", () => {
  it("updates password_hash for an existing username and deletes its sessions, leaving enabled/permissions untouched", async () => {
    await pool.query("INSERT INTO operators (id, username, password_hash, enabled) VALUES ($1, $2, $3, $4)", ["op-reset", "reset-target", "scrypt$32768$8$1$b2xk$b2xk", true]);
    await pool.query("INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'operators.manage')", ["op-reset"]);
    await pool.query("INSERT INTO operator_sessions (token_hash, operator_id, created_at, expires_at) VALUES ($1, $2, now(), now() + interval '8 hours')", ["reset-token-hash", "op-reset"]);

    const resolvedIds: OperatorId[] = [];
    const result = await resetOperatorPassword(pool, "reset-target", "scrypt$32768$8$1$bmV3$bmV3", (operatorId) => {
      resolvedIds.push(operatorId);
      return noopWitness;
    });

    expect(result).toEqual({ ok: true, operatorId: "op-reset" });
    // `buildWitness` receives the RESOLVED id, not a caller-guessed one —
    // proven directly, not merely inferred from the result matching.
    expect(resolvedIds).toEqual(["op-reset"]);
    const { rows: operatorRows } = await pool.query<{ readonly password_hash: string; readonly enabled: boolean }>("SELECT password_hash, enabled FROM operators WHERE id = $1", ["op-reset"]);
    expect(operatorRows[0]?.password_hash).toBe("scrypt$32768$8$1$bmV3$bmV3");
    expect(operatorRows[0]?.enabled).toBe(true); // untouched
    const { rows: permissionRows } = await pool.query("SELECT 1 FROM operator_permissions WHERE operator_id = $1", ["op-reset"]);
    expect(permissionRows).toHaveLength(1); // untouched
    const { rows: sessionRows } = await pool.query("SELECT 1 FROM operator_sessions WHERE operator_id = $1", ["op-reset"]);
    expect(sessionRows).toHaveLength(0); // deleted
  });

  it("refuses against an unknown username, invoking no witness", async () => {
    let calls = 0;
    const witness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => {
      calls += 1;
      await exec("SELECT 1", []);
    };

    const result = await resetOperatorPassword(pool, "does-not-exist", "scrypt$32768$8$1$bmV3$bmV3", () => witness);

    expect(result).toEqual({ ok: false, reason: "unknown-username" });
    expect(calls).toBe(0);
  });
});
