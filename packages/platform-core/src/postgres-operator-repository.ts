import type { Pool } from "pg";
import type { CreateOperatorResult, OperatorDraft, OperatorId, OperatorRecord, OperatorRepository } from "./operator-repository.js";

/**
 * Postgres-backed `OperatorRepository` (design §2.3-shape/§3/§4, tasks
 * 8a.9): `apps/admin`'s composition root (slice 8b onward) is the intended
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

export function createPostgresOperatorRepository(pool: Pool): OperatorRepository {
  return {
    async findByUsername(username) {
      const { rows } = await pool.query<OperatorRow>(`SELECT ${SELECT_COLUMNS} FROM operators WHERE username = $1`, [username]);
      return rows[0] === undefined ? undefined : toOperatorRecord(rows[0]);
    },
    async create(draft: OperatorDraft) {
      try {
        const { rows } = await pool.query<OperatorRow>(`INSERT INTO operators (id, username, password_hash) VALUES ($1, $2, $3) RETURNING ${SELECT_COLUMNS}`, [
          draft.id,
          draft.username,
          draft.passwordHash,
        ]);
        return { ok: true, operator: toOperatorRecord(rows[0]!) };
      } catch (error) {
        return mapUniqueViolation(error);
      }
    },
  };
}
