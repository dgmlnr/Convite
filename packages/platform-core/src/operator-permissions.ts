import type { Pool, PoolClient } from "pg";
import type { OperatorId, OperatorMutationResult, OperatorWriteWitness } from "./operator-repository.js";
import { withLastAccountManagerGuard, type LastAccountManagerGuardResult, type LastAccountManagerWitness } from "./last-account-manager.js";

/**
 * `grantPermission`/`revokePermission` (design §8's own advance note: "a
 * following PR, reusing this exact export"; spec Domain K, tasks 12.2/12.6) —
 * standalone Postgres-bound functions, deliberately NOT `OperatorRepository`
 * port methods, the identical "no port, no static double when the mechanism
 * is unavoidably Postgres-native" precedent `operator-lifecycle.ts`'s own
 * docstring sets for `disableOperator`/`enableOperator`: neither has a
 * faithful in-memory counterpart, since `revokePermission` needs the SAME
 * `withLastAccountManagerGuard` this package already exports, and a static
 * `Map`-backed adapter has no transaction for that guard's advisory lock to
 * run inside.
 *
 * PLATFORM-CORE NEVER LEARNS THE `PERMISSIONS` TAXONOMY (design §6.1) — the
 * identical boundary `operator-bootstrap.ts`'s own docstring already states
 * for `bootstrapOperator`: `permission` arrives here as a plain `string`,
 * validated against the closed seven-member vocabulary ONE LAYER UP, in
 * `apps/admin/src/permission-handlers.ts`, the only module allowed to know
 * that vocabulary exists (threat: mass assignment on permission grant). This
 * function only knows a permission is a row.
 *
 * REVOKE ROUTES THROUGH THE SAME GUARD REGARDLESS OF WHICH PERMISSION IS
 * BEING REMOVED (task 12.6's own "reuse PR13's advisory-lock guard for the
 * revoke path") — not merely when the target happens to be
 * `operators.manage`. The guard's own post-mutation count query (design §8)
 * only ever counts `operators.manage` holders, so revoking any OTHER
 * permission leaves that count unchanged and the guard never refuses it;
 * routing every revoke through one shared function costs one extra query at
 * this panel's single-digit-operator scale and removes an entire branch
 * ("is this the dangerous permission?") that would otherwise have to stay
 * correct forever.
 *
 * GRANT NEEDS NO GUARD AT ALL: adding a holder can only ever WIDEN the set of
 * enabled `operators.manage` holders, never shrink it, so the invariant the
 * guard protects cannot be tripped by this direction — the identical
 * argument `operator-lifecycle.ts`'s own `enableOperator` docstring already
 * makes for the disable/enable pair.
 */

export type RevokePermissionResult = { readonly ok: true } | { readonly ok: false; readonly reason: "not-granted" };
export type RevokePermissionGuardedResult = LastAccountManagerGuardResult<RevokePermissionResult>;

/**
 * `operator_permissions`'s own composite PK (migration 003) makes a double
 * grant a no-op INSERT-conflict, never a duplicate row or a thrown error —
 * `ON CONFLICT (operator_id, permission) DO NOTHING` is the datastore-level
 * enforcement this comment describes, the identical "the constraint
 * enforces, the catch translates" discipline every other unique-violation
 * catch in this package already follows, just with nothing to catch here
 * because idempotence IS the desired behavior (spec Domain K names no
 * "already granted" refusal scenario at all).
 *
 * The `operator_id` FK (migration 003: `REFERENCES operators(id)`) is what
 * catches an unknown target operator — SQLSTATE 23503, mapped the same way
 * `mapUniqueViolation` maps 23505 elsewhere in this package: read the real
 * constraint name back from the driver, never a `SELECT`-then-`INSERT`
 * existence probe (a TOCTOU race this package's own writers never accept).
 *
 * The `WriteWitness` runs on the SAME checked-out client as the INSERT,
 * inside the SAME transaction (design §9's own atomicity contract, task
 * 10.6's `withTransactionalWitness` precedent, duplicated here rather than
 * imported for the identical per-file reason `postgres-operator-repository.ts`'s
 * own docstring already gives) — a witness that throws rolls the grant back
 * with it; a witness that commits leaves both rows. Proven for real by a
 * deliberate, reverted probe: routing the witness's `exec` through a SEPARATE
 * `pool.query` call instead of the checked-out `client` left the granted row
 * committed even though the witness threw — `operator-permissions.postgres.test.ts`'s
 * own "witness rolls back the grant" case failed for real against that
 * probe before being fixed back to the single-client shape below.
 */
export async function grantPermission(pool: Pool, operatorId: OperatorId, permission: string, grantedBy: OperatorId, w: OperatorWriteWitness): Promise<OperatorMutationResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO operator_permissions (operator_id, permission, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (operator_id, permission) DO NOTHING`,
        [operatorId, permission, grantedBy],
      );
    } catch (error) {
      await client.query("ROLLBACK");
      const pgError = error as { readonly code?: string; readonly constraint?: string };
      if (pgError.code === "23503" && pgError.constraint === "operator_permissions_operator_id_fkey") {
        return { ok: false, reason: "unknown-operator" };
      }
      // Anything else must reach the caller unchanged, same "never silently
      // swallow" rule every other write adapter in this package follows.
      throw error;
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

/**
 * `DELETE ... RETURNING operator_id` is the SAME "does a row exist" idiom
 * `operator-lifecycle.ts`'s own `disableOperator`/`enableOperator` already
 * use for `UPDATE ... RETURNING id` — an empty `rows` array means nothing
 * matched, `"not-granted"`, whether because the permission was never granted
 * or the operator itself does not exist; this function does not need to
 * distinguish the two, unlike `grantPermission`'s own FK-violation catch,
 * because a `DELETE` that matches zero rows is not an error, it is simply
 * "there was nothing to remove."
 *
 * Wrapped in `withLastAccountManagerGuard` (this module's own docstring
 * above explains why every revoke goes through it, not only
 * `operators.manage` revocations) — the mutation, the guard's own
 * post-mutation holder count, and the audit witness all commit or roll back
 * together, on the SAME client, the identical atomicity
 * `disableOperator`/`enableOperator` already established for the sibling
 * lifecycle operations. Proven for real by a deliberate, reverted probe: a
 * first version issued the `DELETE` directly against `pool`, outside the
 * guard entirely — `operator-permissions.postgres.test.ts`'s own two-
 * genuinely-concurrent-transactions case then failed for real (both
 * revocations of the two remaining `operators.manage` holders succeeded,
 * leaving zero) before this function was wrapped in
 * `withLastAccountManagerGuard` as written below.
 */
export async function revokePermission(pool: Pool, operatorId: OperatorId, permission: string, w: LastAccountManagerWitness): Promise<RevokePermissionGuardedResult> {
  return withLastAccountManagerGuard(pool, w, async (client: PoolClient) => {
    const { rows } = await client.query<{ readonly operator_id: string }>(
      "DELETE FROM operator_permissions WHERE operator_id = $1 AND permission = $2 RETURNING operator_id",
      [operatorId, permission],
    );
    if (rows[0] === undefined) return { ok: false as const, reason: "not-granted" as const };
    return { ok: true as const };
  });
}
