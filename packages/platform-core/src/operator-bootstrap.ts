import type { Pool, PoolClient } from "pg";
import type { OperatorId } from "./operator-repository.js";

/**
 * `bootstrapOperator`/`resetOperatorPassword` (design §12, spec Domain J, tasks
 * 11b.3-11b.8) — Postgres-BOUND functions the bootstrap CLI (`apps/admin/src/
 * bootstrap-operator.ts`) calls into. Deliberately standalone, not
 * `OperatorRepository` port methods — the same "no port, no static double
 * when the mechanism is unavoidably Postgres-native" precedent
 * `postgres-operator-authorization.ts`/`operator-lifecycle.ts` already set:
 * `bootstrapOperator` grants an ARBITRARY, caller-supplied list of
 * permissions atomically alongside the operator row, a shape `OperatorRepository.create`
 * never needed and should not grow just for this one caller.
 *
 * THIS MODULE HAS NO OPINION ON THE PERMISSION VOCABULARY — `input.permissions`
 * is whatever the CALLER iterated over (design §12: "grants every permission
 * by ITERATING `PERMISSIONS`, rather than a hardcoded list"). `PERMISSIONS`
 * itself lives in `apps/admin/src/permissions.ts`, an app-level constant this
 * L1 package must not depend on — `platform-core` stays permission-name-agnostic,
 * the same boundary that keeps it ignorant of the `audit_entries` schema
 * (`WriteWitness`'s own docstring).
 *
 * BOTH functions run their ENTIRE effect — every row written, plus the audit
 * witness — inside ONE transaction. This matters most for `bootstrapOperator`:
 * a bootstrap that inserted the operator row and SOME but not all permission
 * rows before failing would create exactly the kind of half-privileged
 * account this change's own last-account-manager guard (`last-account-manager.ts`)
 * exists to prevent reaching accidentally — atomicity here is not a nicety,
 * it is what keeps "the bootstrapped operator holds every permission" a fact
 * rather than a race.
 */

export type BootstrapWitness = (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => Promise<void>;

export interface BootstrapOperatorInput {
  readonly id: OperatorId;
  readonly username: string;
  readonly passwordHash: string;
  readonly permissions: readonly string[];
}

export type BootstrapOperatorResult = { readonly ok: true; readonly operatorId: OperatorId } | { readonly ok: false; readonly reason: "operator-exists" };

/**
 * First-run bootstrap (tasks 11b.3-11b.4): refuses if ANY operator row
 * already exists — the caller (`apps/admin/src/bootstrap-operator.ts`) is
 * responsible for deciding whether that refusal itself should instead route
 * to `resetOperatorPassword` when `--force` was passed (design §12's own
 * "the reset path needs `--force`" requirement); this function only ever
 * performs FIRST-RUN creation and never silently resets an existing account.
 * `granted_by = id` (self-referential — migration 003's own comment:
 * "the only honest actor available", since no OTHER operator exists yet to
 * grant these).
 */
export async function bootstrapOperator(pool: Pool, input: BootstrapOperatorInput, w: BootstrapWitness): Promise<BootstrapOperatorResult> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ readonly count: number }>("SELECT count(*)::int AS count FROM operators");
    if (rows[0]!.count > 0) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "operator-exists" };
    }
    await client.query("INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3)", [input.id, input.username, input.passwordHash]);
    for (const permission of input.permissions) {
      await client.query("INSERT INTO operator_permissions (operator_id, permission, granted_by) VALUES ($1, $2, $1)", [input.id, permission]);
    }
    try {
      await w((sql, values) => client.query(sql, values as unknown[]).then(() => undefined));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    await client.query("COMMIT");
    return { ok: true, operatorId: input.id };
  } finally {
    client.release();
  }
}

export type ResetOperatorPasswordResult = { readonly ok: true; readonly operatorId: OperatorId } | { readonly ok: false; readonly reason: "unknown-username" };

/**
 * `--force` reset (tasks 11b.5-11b.8, design §12): overwrites ONLY
 * `password_hash`/`password_changed_at` for an EXISTING username — never
 * `enabled`, never any permission row — and DELETEs every live session that
 * operator holds, because a password reset that leaves a stolen session
 * alive has not reset anything (the identical argument design §7 already
 * makes for `disableOperator`). All inside one transaction with the audit
 * witness, same shape as `bootstrapOperator`.
 *
 * `buildWitness` is a FUNCTION OF THE RESOLVED `OperatorId`, not a plain
 * witness — unlike `bootstrapOperator`, where the caller generates a fresh id
 * BEFORE calling in, this function's whole point is resolving `username` to
 * an id it does not yet know (`UPDATE ... RETURNING id`), and design §12's
 * own self-referential-actor requirement (`operator.password.reset-by-cli`,
 * attributed to the account whose password was just reset — the only honest
 * actor available to a CLI operation with no logged-in session) needs that
 * id INSIDE the witness. Deferring witness construction to after resolution
 * is what makes `apps/admin/src/bootstrap-operator.ts`'s own call site able
 * to build `{ actorOperatorId: operatorId, targetOperatorId: operatorId, ... }`
 * without a chicken-and-egg problem.
 */
export async function resetOperatorPassword(pool: Pool, username: string, passwordHash: string, buildWitness: (operatorId: OperatorId) => BootstrapWitness): Promise<ResetOperatorPasswordResult> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ readonly id: string }>("UPDATE operators SET password_hash = $2, password_changed_at = now() WHERE username = $1 RETURNING id", [username, passwordHash]);
    if (rows[0] === undefined) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "unknown-username" };
    }
    const operatorId = rows[0].id as OperatorId;
    await client.query("DELETE FROM operator_sessions WHERE operator_id = $1", [operatorId]);
    try {
      const w = buildWitness(operatorId);
      await w((sql, values) => client.query(sql, values as unknown[]).then(() => undefined));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    await client.query("COMMIT");
    return { ok: true, operatorId };
  } finally {
    client.release();
  }
}
