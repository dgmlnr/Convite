import type { Pool, PoolClient } from "pg";
import type { CreateOperatorResult, OperatorDraft, OperatorId, OperatorMutationResult, OperatorRecord, OperatorRepository, OperatorWriteWitness } from "./operator-repository.js";

/**
 * Postgres-backed `OperatorRepository` (design §2.3-shape/§3/§4, tasks
 * 8a.9/11a.2/11a.10-11a.11): `apps/admin`'s composition root is the intended
 * holder of a `Pool` this adapter wraps, built under `convite_admin` —
 * `SELECT, INSERT, UPDATE, DELETE` on `operators`, `operator_permissions`,
 * `operator_sessions` (migration 003, design §4). `import type { Pool } from
 * "pg"` is type-only and erased at build, same discipline as
 * `postgres-tenant-admin-repository.ts`; the ONE value import of `pg` stays
 * confined to `postgres-client.ts` (decision 1.5). This file lives inside
 * `packages/platform-core/src`, already covered by
 * `no-pg-outside-platform-core`'s `from.pathNot` scope — no new
 * `.dependency-cruiser.cjs` rule needed (tasks §0.4).
 *
 * `username` UNIQUENESS: THE CONSTRAINT ENFORCES, THIS CATCH TRANSLATES —
 * same discipline `postgres-tenant-admin-repository.ts`'s own docstring
 * establishes for `embed_key`. `operators.username` is `UNIQUE` since
 * migration 003; this adapter never runs a `SELECT`-then-`INSERT` existence
 * check before writing (a TOCTOU race) — every write goes straight to the
 * datastore and `mapUniqueViolation` below reads the REAL failure's
 * SQLSTATE and constraint name back into the discriminated result
 * `OperatorRepository`'s callers already expect.
 *
 * `create`/`updatePassword` now run their own `WriteWitness` INSIDE the same
 * transaction as the row mutation (task 11a's own retrofit of PR9b's
 * original witness-less `create`) — `withTransactionalWitness` below is a
 * direct, deliberate duplication of `postgres-tenant-admin-repository.ts`'s
 * own private helper of the identical name and shape, not a shared import:
 * this repo's own convention (`tenant-admin.ts`/`operator-repository.ts` both
 * declaring their own witness-shaped callback type rather than sharing one)
 * already establishes per-file duplication over a premature shared
 * abstraction for a ~20-line helper with no third caller yet.
 */

interface OperatorRow {
  readonly id: string;
  readonly username: string;
  readonly password_hash: string;
  readonly enabled: boolean;
}

const SELECT_COLUMNS = "id, username, password_hash, enabled";

function toOperatorRecord(row: OperatorRow): OperatorRecord {
  return { id: row.id as OperatorId, username: row.username, passwordHash: row.password_hash, enabled: row.enabled };
}

function mapUniqueViolation(error: unknown): CreateOperatorResult {
  const pgError = error as { readonly code?: string; readonly constraint?: string };
  if (pgError.code === "23505") {
    return { ok: false, reason: pgError.constraint === "operators_pkey" ? "operator-id-taken" : "username-taken" };
  }
  // Anything else (an unreachable database, a malformed query) must reach
  // the caller unchanged, same "never silently swallow" rule
  // `postgres-tenant-admin-repository.ts`'s own write path already follows.
  throw error;
}

/** Identical shape and purpose to `postgres-tenant-admin-repository.ts`'s own
 * private helper of the same name — see this file's own docstring for why it
 * is duplicated rather than shared. */
async function withTransactionalWitness<T extends { readonly ok: boolean }>(pool: Pool, w: OperatorWriteWitness, mutate: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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
    try {
      await w((sql, values) => client.query(sql, values as unknown[]).then(() => undefined));
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

export function createPostgresOperatorRepository(pool: Pool): OperatorRepository {
  return {
    async findByUsername(username) {
      const { rows } = await pool.query<OperatorRow>(`SELECT ${SELECT_COLUMNS} FROM operators WHERE username = $1`, [username]);
      return rows[0] === undefined ? undefined : toOperatorRecord(rows[0]);
    },
    async findById(id) {
      const { rows } = await pool.query<OperatorRow>(`SELECT ${SELECT_COLUMNS} FROM operators WHERE id = $1`, [id]);
      return rows[0] === undefined ? undefined : toOperatorRecord(rows[0]);
    },
    async create(draft: OperatorDraft, w) {
      return withTransactionalWitness<CreateOperatorResult>(pool, w, async (client) => {
        try {
          const { rows } = await client.query<OperatorRow>(`INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3) RETURNING ${SELECT_COLUMNS}`, [
            draft.id,
            draft.username,
            draft.passwordHash,
          ]);
          return { ok: true, operator: toOperatorRecord(rows[0]!) };
        } catch (error) {
          return mapUniqueViolation(error);
        }
      });
    },
    async updatePassword(id, passwordHash, w) {
      return withTransactionalWitness<OperatorMutationResult>(pool, w, async (client) => {
        const { rows } = await client.query<OperatorRow>(`UPDATE operators SET password_hash = $2, password_changed_at = now() WHERE id = $1 RETURNING ${SELECT_COLUMNS}`, [id, passwordHash]);
        if (rows[0] === undefined) return { ok: false, reason: "unknown-operator" };
        return { ok: true };
      });
    },
  };
}
