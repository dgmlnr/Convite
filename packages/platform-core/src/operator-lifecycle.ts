import type { Pool, PoolClient } from "pg";
import type { OperatorId } from "./operator-repository.js";
import { withLastAccountManagerGuard, type LastAccountManagerWitness } from "./last-account-manager.js";

/**
 * `disableOperator`/`enableOperator` (spec Domain J, design §7/§8, tasks
 * 11a.3-11a.5/11a.8-11a.9) — Postgres-BOUND functions, deliberately NOT
 * `OperatorRepository` port methods. See that port's own docstring for the
 * full reasoning: both operations are cross-table (`operators` +
 * `operator_sessions`, and `disable` additionally needs the
 * `operator_permissions`-spanning last-account-manager invariant) in a way
 * this package's own STATIC in-memory adapter has no faithful way to model —
 * the identical "no port, no static double when the mechanism is
 * unavoidably Postgres-native" precedent `postgres-operator-authorization.ts`
 * already sets for `findOperatorAuthorizationContext`.
 */

export type OperatorLifecycleResult = { readonly ok: true } | { readonly ok: false; readonly reason: "unknown-operator" };
export type OperatorLifecycleGuardedResult = OperatorLifecycleResult | { readonly ok: false; readonly reason: "last-account-manager" };

/**
 * Disables an operator account AND deletes every session it holds, atomically,
 * inside the SAME transaction the last-account-manager guard already opens
 * (design §7: "disable still deletes sessions, and that is not redundant" —
 * spec Domain J's own "re-enabling must not resurrect a session invalidated
 * while disabled" requirement is what the session DELETE satisfies; the
 * `enabled` flag alone only satisfies "a disabled account cannot log in
 * again").
 *
 * Routed through `withLastAccountManagerGuard` (design §8): a disable that
 * would leave zero enabled `operators.manage` holders is refused and rolled
 * back — mutation, session deletion, and any audit witness together — before
 * ever reaching `COMMIT`.
 */
export async function disableOperator(pool: Pool, id: OperatorId, w: LastAccountManagerWitness): Promise<OperatorLifecycleGuardedResult> {
  return withLastAccountManagerGuard(pool, w, async (client: PoolClient) => {
    const { rows } = await client.query<{ readonly id: string }>("UPDATE operators SET enabled = false WHERE id = $1 RETURNING id", [id]);
    if (rows[0] === undefined) return { ok: false as const, reason: "unknown-operator" as const };
    // SAME transaction, SAME client — the guard's own COMMIT is what makes
    // this atomic with both the `enabled` flip above and the last-account-
    // manager count check that runs after this function returns.
    await client.query("DELETE FROM operator_sessions WHERE operator_id = $1", [id]);
    return { ok: true as const };
  });
}

/**
 * Re-enables an operator account — `enabled = true` ONLY, no session
 * restore (design §7's own closing argument: re-enabling must not resurrect
 * a session invalidated while disabled). Never routed through the
 * last-account-manager guard: enabling an account can only ever ADD a
 * holder back, never remove one, so the invariant this guard protects
 * cannot be tripped by this direction.
 */
export async function enableOperator(pool: Pool, id: OperatorId, w: (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => Promise<void>): Promise<OperatorLifecycleResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ readonly id: string }>("UPDATE operators SET enabled = true WHERE id = $1 RETURNING id", [id]);
    if (rows[0] === undefined) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "unknown-operator" };
    }
    try {
      await w((sql, values) => client.query(sql, values as unknown[]).then(() => undefined));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    await client.query("COMMIT");
    return { ok: true };
  } finally {
    client.release();
  }
}
