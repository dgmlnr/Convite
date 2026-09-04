import type { Pool, PoolClient } from "pg";

/**
 * The last-account-manager guard (design §8, spec Domain J/K's "the last-admin
 * failure mode is guarded" requirement) — the ONLY thing standing between the
 * panel and an unadministerable state, because this repository has NO role
 * layer (decisions #3684 item 9: permissions are assigned directly to
 * operator accounts). There is no conceptual "admin role" acting as a safety
 * net if the last holder of `operators.manage` is disabled or has that
 * permission revoked — the permission is one checkbox among several, and it
 * can be un-ticked by distraction, or lost through disabling an account,
 * reaching an unadministerable panel through two well-intentioned clicks.
 *
 * THE RACE THIS CLOSES, AND WHY `SELECT ... FOR UPDATE` DOES NOT (design §8):
 * revoking a permission writes `operator_permissions`; disabling an account
 * writes `operators`. Two concurrent transactions — one revoking holder A's
 * grant, one disabling holder B's account — touch DIFFERENT tables' rows.
 * Under READ COMMITTED, each transaction's own `count(*)` read predates the
 * other's write, so each sees 2 holders, each removes one, and both commit —
 * classic write skew, invisible to either transaction on its own. A row lock
 * on `operators` never blocks a write to `operator_permissions`: locking
 * specific ROWS cannot protect an invariant that spans two tables when
 * neither transaction's own row set overlaps the other's.
 *
 * THE FIX: `pg_advisory_xact_lock` on a FIXED CONSTANT (the invariant itself,
 * never a row), acquired FIRST inside the transaction, with the holder count
 * checked AFTER the mutation runs, inside that SAME transaction. Because the
 * lock is transaction-scoped (`_xact_`), it releases automatically on COMMIT
 * or ROLLBACK — no leak path, unlike a session-scoped `pg_advisory_lock`
 * (the migration runner's own choice, a DIFFERENT documented constant, never
 * this one). Serializing every `operators.manage`-affecting write behind ONE
 * lock is free at this panel's single-digit-operator scale (design §7's own
 * scale argument).
 *
 * CHECKING AFTER THE MUTATION, rather than reasoning "would this leave zero
 * holders" BEFORE running it, is what makes ONE function correct for BOTH
 * callers this design names — disabling an account (this PR) and revoking a
 * permission (a following PR, reusing this exact export) — with no bespoke
 * reasoning about which rows either specific mutation touches: the check
 * asks the real invariant against the real post-mutation state.
 *
 * A REFUSED mutation (either "unknown-operator" from the caller's own
 * `mutate`, or "last-account-manager" from this guard) never reaches
 * `witness` at all — the same "zero witness calls per refused write"
 * property `postgres-tenant-admin-repository.ts`'s own `withTransactionalWitness`
 * already establishes (design §9), now doubly enforced here.
 *
 * HONEST LIMIT (design §8's own disclosure, carried forward rather than
 * dropped): this does not hold against `psql` with owner credentials — an
 * owner can always grant themselves `operators.manage` back regardless of
 * what this guard refuses. Its real job is preventing an ACCIDENTAL
 * self-lockout through the panel, the actual failure mode two
 * well-intentioned clicks can reach, not a defense against a determined
 * actor holding database-owner credentials.
 */

/** One documented constant, distinct from `postgres-migrations.ts`'s own
 * session-scoped `pg_advisory_lock` key — design §8's own fixed value. */
const LAST_ACCOUNT_MANAGER_LOCK_KEY = 4021;

export type LastAccountManagerWitness = (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => Promise<void>;

export type LastAccountManagerGuardResult<T> = T | { readonly ok: false; readonly reason: "last-account-manager" };

/**
 * Runs `mutate` on ONE checked-out client, inside ONE transaction, with the
 * advisory lock already held — then, ONLY if `mutate` itself reports success
 * (`result.ok === true`), counts enabled `operators.manage` holders AFTER the
 * mutation and rolls the WHOLE transaction back (mutation included) if that
 * count is zero, returning `{ ok: false, reason: "last-account-manager" }`
 * instead. `witness` runs only once the guard has ALSO cleared, on the SAME
 * client as the mutation — the identical atomicity contract
 * `postgres-tenant-admin-repository.ts`'s own `withTransactionalWitness`
 * establishes for tenant writes, extended here to a guard that itself needs
 * its own transaction-scoped lock.
 */
export async function withLastAccountManagerGuard<T extends { readonly ok: boolean }>(
  pool: Pool,
  witness: LastAccountManagerWitness,
  mutate: (client: PoolClient) => Promise<T>,
): Promise<LastAccountManagerGuardResult<T>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Acquired FIRST, before the mutation — every concurrent caller of this
    // function serializes here, on the SAME fixed key, regardless of which
    // table its own `mutate` is about to touch.
    await client.query("SELECT pg_advisory_xact_lock($1)", [LAST_ACCOUNT_MANAGER_LOCK_KEY]);

    let result: T;
    try {
      result = await mutate(client);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    if (!result.ok) {
      await client.query("ROLLBACK");
      return result;
    }

    // THE CHECK RUNS AFTER THE MUTATION, ON ITS OWN POST-STATE (design §8) —
    // never a pre-mutation "would this leave zero" guess, which is exactly
    // the reasoning that loses track of a mutation touching a table the
    // guard itself never inspects.
    const { rows } = await client.query<{ readonly holders: number }>(
      `SELECT count(*)::int AS holders
         FROM operators o
         JOIN operator_permissions p ON p.operator_id = o.id
        WHERE o.enabled AND p.permission = 'operators.manage'`,
    );
    if (rows[0]!.holders === 0) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "last-account-manager" };
    }

    try {
      await witness((sql, values) => client.query(sql, values as unknown[]).then(() => undefined));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    await client.query("COMMIT");
    return result;
  } finally {
    client.release();
  }
}
