import type { Pool } from "pg";
import type { OperatorId } from "./operator-repository.js";
import type { OperatorSessionRecord, OperatorSessionRepository } from "./operator-session-repository.js";

/**
 * Postgres-backed `OperatorSessionRepository` (design §3/§4/§11.2, tasks
 * 8b.1-8b.2/8b.7-8b.8). `apps/admin`'s composition root holds the `Pool` this
 * adapter wraps, built under `convite_admin` (migration 003 grants it
 * `SELECT, INSERT, UPDATE, DELETE` on `operator_sessions`). `import type
 * { Pool } from "pg"` is type-only and erased at build — same discipline
 * `postgres-operator-repository.ts` already establishes; the ONE value
 * import of `pg` stays confined to `postgres-client.ts` (decision 1.5). This
 * file lives inside `packages/platform-core/src`, already covered by
 * `no-pg-outside-platform-core`'s `from.pathNot` scope — no new
 * `.dependency-cruiser.cjs` rule needed (tasks §0.4, confirmed again here).
 *
 * `token_hash` is the table's PRIMARY KEY (migration 003's own comment): a
 * `create` racing a `create` for the identical token hash is astronomically
 * unlikely (32 random bytes) and, unlike `operators.username`, is not a
 * scenario this port needs a discriminated "taken" result for — a genuine
 * collision here would mean the CSPRNG failed, and that should surface as a
 * loud Postgres constraint error, not a quiet `{ ok: false }` a caller might
 * paper over.
 */

interface OperatorSessionRow {
  readonly token_hash: string;
  readonly operator_id: string;
  readonly created_at: Date;
  readonly expires_at: Date;
}

function toSessionRecord(row: OperatorSessionRow): OperatorSessionRecord {
  return { tokenHash: row.token_hash, operatorId: row.operator_id as OperatorId, createdAt: row.created_at.getTime(), expiresAt: row.expires_at.getTime() };
}

export function createPostgresOperatorSessionRepository(pool: Pool): OperatorSessionRepository {
  return {
    async create(session) {
      // Parameterized values only (threat matrix, same discipline every
      // write adapter in this package follows since
      // `postgres-tenant-admin-repository.ts`'s own SQL-injection proof) —
      // `to_timestamp` converts the epoch-ms `Clock` values this port
      // receives into `timestamptz`, the column's own stored type.
      await pool.query("INSERT INTO operator_sessions (token_hash, operator_id, created_at, expires_at) VALUES ($1, $2, to_timestamp($3::double precision / 1000), to_timestamp($4::double precision / 1000))", [
        session.tokenHash,
        session.operatorId,
        session.createdAt,
        session.expiresAt,
      ]);
    },
    async findByTokenHash(tokenHash) {
      const { rows } = await pool.query<OperatorSessionRow>("SELECT token_hash, operator_id, created_at, expires_at FROM operator_sessions WHERE token_hash = $1", [tokenHash]);
      return rows[0] === undefined ? undefined : toSessionRecord(rows[0]);
    },
    async deleteByTokenHash(tokenHash) {
      // No existence check first — DELETE on a missing row is already a
      // harmless no-op in SQL, and logout must stay idempotent (contract
      // test: "deleting an already-absent token hash is a harmless no-op").
      await pool.query("DELETE FROM operator_sessions WHERE token_hash = $1", [tokenHash]);
    },
  };
}
