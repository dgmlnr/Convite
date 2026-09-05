import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { OperatorId } from "./operator-repository.js";
import { connectPostgres } from "./postgres-client.js";
import { disableOperator, enableOperator } from "./operator-lifecycle.js";
import { readPostgresTestUrl } from "./postgres-test-harness.js";

/**
 * `disableOperator`/`enableOperator` (design §7/§8, spec Domain J, tasks
 * 11a.3-11a.5/11a.8-11a.9) — proven against real Postgres, since both are
 * cross-table, transaction-bound functions with no static in-memory
 * counterpart (`operator-lifecycle.ts`'s own docstring).
 */
let pool: Pool;

beforeAll(async () => {
  pool = await connectPostgres(readPostgresTestUrl());
});

afterAll(async () => {
  await pool.end();
});

async function seedOperatorWithSession(id: string, options?: { readonly withManagePermission?: boolean }): Promise<void> {
  await pool.query("INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3)", [id, `${id}-username`, "scrypt$32768$8$1$c2FsdA==$a2V5"]);
  await pool.query("INSERT INTO operator_sessions (token_hash, operator_id, created_at, expires_at) VALUES ($1, $2, now(), now() + interval '8 hours')", [`${id}-token-hash`, id]);
  if (options?.withManagePermission === true) {
    await pool.query("INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'operators.manage')", [id]);
  }
}

const noopWitness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => exec("SELECT 1", []);

describe("disableOperator — immediate session invalidation, never resurrected by enableOperator (spec Domain J, design §7)", () => {
  beforeAll(async () => {
    await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
  });

  it("disables the account and deletes every one of its sessions, in the SAME call", async () => {
    await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
    await seedOperatorWithSession("op-disable-target", { withManagePermission: true });
    await pool.query("INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3)", ["op-other-holder", "other-holder", "scrypt$32768$8$1$c2FsdA==$a2V5"]);
    await pool.query("INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'operators.manage')", ["op-other-holder"]);

    const result = await disableOperator(pool, "op-disable-target" as OperatorId, noopWitness);

    expect(result).toEqual({ ok: true });
    const { rows: operatorRows } = await pool.query<{ readonly enabled: boolean }>("SELECT enabled FROM operators WHERE id = $1", ["op-disable-target"]);
    expect(operatorRows[0]?.enabled).toBe(false);
    const { rows: sessionRows } = await pool.query("SELECT 1 FROM operator_sessions WHERE operator_id = $1", ["op-disable-target"]);
    expect(sessionRows).toHaveLength(0);
  });

  it("re-enabling restores the ability to authenticate but NEVER resurrects the deleted session — the property this pairing exists to prove", async () => {
    await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
    await seedOperatorWithSession("op-reenable-target");
    // A SEPARATE operators.manage holder, distinct from the disable target
    // (which holds no permission at all here) — WITHOUT this, the guard's
    // own post-mutation count check (design §8's own literal SQL: count
    // AFTER, never a before/after DELTA) sees a pre-existing holder count of
    // ZERO (nobody has ever been granted the permission in this fresh seed)
    // and refuses EVERY disable, even of a non-holder, since it cannot tell
    // "always was zero" from "this mutation just made it zero". A genuine
    // finding, caught by this exact test failing for real on its first
    // version (missing this seed row) before being fixed here — not a flaw
    // in the guard, since design §8's own SQL is written the same way and a
    // real deployment always has >=1 holder from bootstrap onward (design
    // §12), but an honest edge case worth recording rather than silently
    // patching away.
    await pool.query("INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3)", ["op-reenable-other-holder", "reenable-other-holder", "scrypt$32768$8$1$c2FsdA==$a2V5"]);
    await pool.query("INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'operators.manage')", ["op-reenable-other-holder"]);

    await disableOperator(pool, "op-reenable-target" as OperatorId, noopWitness);
    const enableResult = await enableOperator(pool, "op-reenable-target" as OperatorId, noopWitness);

    expect(enableResult).toEqual({ ok: true });
    const { rows: operatorRows } = await pool.query<{ readonly enabled: boolean }>("SELECT enabled FROM operators WHERE id = $1", ["op-reenable-target"]);
    expect(operatorRows[0]?.enabled).toBe(true);
    // THE PROOF: the session row deleted by `disableOperator` is GONE for
    // good — `enableOperator` never re-inserts it, by construction (its own
    // SQL touches only `operators.enabled`, never `operator_sessions`).
    const { rows: sessionRows } = await pool.query("SELECT 1 FROM operator_sessions WHERE operator_id = $1", ["op-reenable-target"]);
    expect(sessionRows).toHaveLength(0);
  });

  it("refuses disableOperator against an unknown operator id, invoking no witness", async () => {
    await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
    let calls = 0;
    const witness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => {
      calls += 1;
      await exec("SELECT 1", []);
    };
    const result = await disableOperator(pool, "does-not-exist" as OperatorId, witness);
    expect(result).toEqual({ ok: false, reason: "unknown-operator" });
    expect(calls).toBe(0);
  });

  it("refuses disabling the SOLE enabled operators.manage holder, leaving the account enabled with its session intact (task 11a.8, spec Domain J)", async () => {
    await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
    await seedOperatorWithSession("op-sole-holder", { withManagePermission: true });
    let calls = 0;
    const witness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => {
      calls += 1;
      await exec("SELECT 1", []);
    };

    const result = await disableOperator(pool, "op-sole-holder" as OperatorId, witness);

    expect(result).toEqual({ ok: false, reason: "last-account-manager" });
    expect(calls).toBe(0); // rolled back before the witness ever ran
    const { rows: operatorRows } = await pool.query<{ readonly enabled: boolean }>("SELECT enabled FROM operators WHERE id = $1", ["op-sole-holder"]);
    expect(operatorRows[0]?.enabled).toBe(true); // ROLLED BACK, still enabled
    const { rows: sessionRows } = await pool.query("SELECT 1 FROM operator_sessions WHERE operator_id = $1", ["op-sole-holder"]);
    expect(sessionRows).toHaveLength(1); // session also rolled back, still present
  });
});

describe("enableOperator — enabled=true only, refuses unknown operator", () => {
  it("refuses enableOperator against an unknown operator id, invoking no witness", async () => {
    await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
    let calls = 0;
    const witness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => {
      calls += 1;
      await exec("SELECT 1", []);
    };
    const result = await enableOperator(pool, "does-not-exist" as OperatorId, witness);
    expect(result).toEqual({ ok: false, reason: "unknown-operator" });
    expect(calls).toBe(0);
  });
});
