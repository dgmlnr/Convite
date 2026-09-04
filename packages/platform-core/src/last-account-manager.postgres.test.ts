import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { connectPostgres } from "./postgres-client.js";
import { withLastAccountManagerGuard } from "./last-account-manager.js";
import { readPostgresTestUrl } from "./postgres-test-harness.js";

/**
 * THE CROSS-TABLE WRITE-SKEW RACE (design §8, task 11a.6/11a.7) — proven
 * against a REAL Postgres with TWO GENUINELY CONCURRENT TRANSACTIONS, not a
 * sequential stand-in. `revokeAGuarded`/`disableBGuarded` below each check
 * out their OWN client from the SAME pool (two real backend connections) and
 * are launched together via `Promise.all` — mirrors the exact concurrency
 * proof `postgres-tenant-admin-repository.postgres.test.ts`'s own
 * "refuses two concurrent creates racing for the SAME embedKey" test already
 * establishes for a same-table race; this one is cross-table, the case that
 * test's own mechanism (a UNIQUE constraint) cannot express at all.
 */
let pool: Pool;

beforeAll(async () => {
  pool = await connectPostgres(readPostgresTestUrl());
});

afterAll(async () => {
  await pool.end();
});

async function seedTwoHolders(): Promise<void> {
  await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
  await pool.query(
    "INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3), ($4, $5, $6)",
    ["op-guard-a", "guard-a", "scrypt$32768$8$1$c2FsdA==$a2V5", "op-guard-b", "guard-b", "scrypt$32768$8$1$c2FsdA==$a2V5"],
  );
  await pool.query(
    "INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'operators.manage'), ($2, 'operators.manage')",
    ["op-guard-a", "op-guard-b"],
  );
}

async function countHolders(): Promise<number> {
  const { rows } = await pool.query<{ readonly holders: number }>(
    "SELECT count(*)::int AS holders FROM operators o JOIN operator_permissions p ON p.operator_id = o.id WHERE o.enabled AND p.permission = 'operators.manage'",
  );
  return rows[0]!.holders;
}

const noopWitness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => exec("SELECT 1", []);

describe("withLastAccountManagerGuard — the cross-table write-skew race SELECT ... FOR UPDATE cannot close (design §8)", () => {
  it("two GENUINELY CONCURRENT transactions — one revoking A's grant directly, one disabling B through the guard — leave EXACTLY ONE enabled operators.manage holder, never zero", async () => {
    await seedTwoHolders();

    // `pg_sleep` widens the window between each transaction's own mutation
    // and its post-mutation count check, forcing genuine overlap rather than
    // hoping two fast localhost round trips happen to collide. KEPT
    // (not a throwaway probe): confirmed genuinely RED without the advisory
    // lock — commenting out `pg_advisory_xact_lock` in `last-account-manager.ts`
    // and re-running THIS exact test (with this exact sleep) produced
    // `[{ok:true},{ok:true}]`, both transactions believing the other holder
    // still existed, leaving zero holders after both committed — reverted
    // once observed. The sleep is what makes that failure reproduce
    // deterministically rather than depend on lucky/unlucky scheduling.
    const revokeA = () =>
      withLastAccountManagerGuard(pool, noopWitness, async (client) => {
        await client.query("DELETE FROM operator_permissions WHERE operator_id = $1 AND permission = 'operators.manage'", ["op-guard-a"]);
        await client.query("SELECT pg_sleep(0.3)");
        return { ok: true as const };
      });
    const disableB = () =>
      withLastAccountManagerGuard(pool, noopWitness, async (client) => {
        await client.query("UPDATE operators SET enabled = false WHERE id = $1", ["op-guard-b"]);
        await client.query("SELECT pg_sleep(0.3)");
        return { ok: true as const };
      });

    const [first, second] = await Promise.all([revokeA(), disableB()]);

    // EXACTLY ONE of the two must be refused — the guard's whole point. Both
    // succeeding would mean the race reopened (the pre-fix failure mode,
    // proven for real below); both refusing would mean the advisory lock
    // never released between them.
    const outcomes = [first, second];
    expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
    expect(outcomes.filter((o) => !o.ok)).toHaveLength(1);
    expect(outcomes.find((o) => !o.ok)).toMatchObject({ ok: false, reason: "last-account-manager" });

    expect(await countHolders()).toBe(1);
  });

  it("a mutation that leaves a NON-zero holder count is never refused — the guard only fires on the real invariant, not on every guarded write", async () => {
    await seedTwoHolders();
    await pool.query("INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3)", ["op-guard-c", "guard-c", "scrypt$32768$8$1$c2FsdA==$a2V5"]);
    await pool.query("INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'operators.manage')", ["op-guard-c"]);

    const result = await withLastAccountManagerGuard(pool, noopWitness, async (client) => {
      await client.query("DELETE FROM operator_permissions WHERE operator_id = $1 AND permission = 'operators.manage'", ["op-guard-a"]);
      return { ok: true as const };
    });

    expect(result).toEqual({ ok: true });
    expect(await countHolders()).toBe(2); // guard-b and guard-c remain
  });

  it("refuses even the FIRST guarded write when it would leave zero holders — no concurrency needed to observe this half of the invariant", async () => {
    await pool.query("TRUNCATE TABLE operator_sessions, operator_permissions, operators CASCADE");
    await pool.query("INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3)", ["op-guard-solo", "guard-solo", "scrypt$32768$8$1$c2FsdA==$a2V5"]);
    await pool.query("INSERT INTO operator_permissions (operator_id, permission) VALUES ($1, 'operators.manage')", ["op-guard-solo"]);

    const result = await withLastAccountManagerGuard(pool, noopWitness, async (client) => {
      await client.query("UPDATE operators SET enabled = false WHERE id = $1", ["op-guard-solo"]);
      return { ok: true as const };
    });

    expect(result).toEqual({ ok: false, reason: "last-account-manager" });
    // ROLLED BACK, not merely refused: the account must still be enabled.
    const { rows } = await pool.query<{ readonly enabled: boolean }>("SELECT enabled FROM operators WHERE id = $1", ["op-guard-solo"]);
    expect(rows[0]?.enabled).toBe(true);
  });
});
