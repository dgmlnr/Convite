import type { Pool, PoolClient } from "pg";
import { SELECT_COLUMNS, toTenantRecord, type TenantRow } from "./postgres-tenant-repository.js";
import type { TenantAdminRepository, TenantWriteResult, WriteWitness } from "./tenant-admin.js";
import { sanitizeTenantTheme } from "./tenant-theme.js";
import { isWindowOrdered } from "./tenant-validity.js";

/**
 * Postgres-backed `TenantAdminRepository` (design §2.3/§3, decision 4):
 * `apps/admin`'s composition root (slice 7) is the ONLY intended holder of a
 * `Pool` this adapter wraps, built under `convite_admin` — `SELECT, INSERT,
 * UPDATE, DELETE` on `tenants` (design §4). `import type { Pool } from "pg"`
 * is type-only and erased at build, same discipline as
 * `postgres-tenant-repository.ts`; the ONE value import of `pg` stays
 * confined to `postgres-client.ts` (decision 1.5). This file itself lives
 * inside `packages/platform-core/src`, already covered by
 * `no-pg-outside-platform-core`'s `from.pathNot` scope — no new
 * `.dependency-cruiser.cjs` rule needed, same note PR3/PR4 already recorded
 * (tasks §0.4).
 *
 * `embedKey` UNIQUENESS: THE CONSTRAINT ENFORCES, THIS CATCH TRANSLATES
 * (design §3's own table). `tenants.embed_key` is `UNIQUE` since migration
 * 001; this adapter never runs a `SELECT`-then-`INSERT`/`UPDATE` existence
 * check before writing — that shape is a TOCTOU race (two concurrent
 * creates, both pass the check, both insert, the datastore's own constraint
 * is what actually catches the second one, not this code). Every write goes
 * straight to the datastore and `mapUniqueViolation` below reads the REAL
 * failure's SQLSTATE and constraint name back into the discriminated result
 * `TenantAdminRepository`'s callers already expect.
 *
 * WriteWitness: task 10.6 closes the slice 4 -> 10 back-edge (tasks §0.5) —
 * `withTransactionalWitness` below is what actually runs a witness's `exec`
 * inside the SAME transaction, on the SAME checked-out client, as the
 * mutation it accompanies. Before this PR, every method here called
 * `w(NOOP_EXEC)` outside any transaction at all (each `pool.query` call
 * auto-commits on its own) — a throwing witness could not roll anything
 * back, because there was nothing to roll back INTO.
 * `postgres-tenant-admin-repository.postgres.test.ts`'s own "task 10.6"
 * describe block proves this failed for real before this change: a witness
 * that inserted a real `audit_entries` row and then threw left the tenant
 * row committed anyway.
 */
function mapUniqueViolation(error: unknown): TenantWriteResult {
  const pgError = error as { readonly code?: string; readonly constraint?: string };
  if (pgError.code === "23505") {
    return { ok: false, reason: pgError.constraint === "tenants_pkey" ? "tenant-id-taken" : "embed-key-taken" };
  }
  // Anything else (a genuinely unreachable database, a malformed query) is
  // NOT a refusal this port's callers should treat as ordinary form input —
  // it must reach the caller unchanged, same "never silently swallow" rule
  // `postgres-tenant-repository.ts`'s own read path already follows.
  throw error;
}

/**
 * Runs `mutate` and — ONLY when it reports a WRITTEN row, never a semantic
 * refusal like "unknown-tenant" or a caught uniqueness violation — invokes
 * `w`'s own `exec` on the SAME checked-out client, inside the SAME
 * transaction as the mutation itself (task 10.6). This is what makes "every
 * operator action is audited" an ATOMICITY property rather than a
 * convention: a witness that throws (a bug in the audit-writing code, a
 * constraint violation on `audit_entries` itself) rolls the mutation back
 * too, and conversely `COMMIT` never runs unless the witness has already
 * succeeded — `mutate`'s own successful write is never left committed
 * without the audit row that is supposed to accompany it.
 *
 * A REFUSED `mutate` never reaches `w` at all — `tenant-admin.contract.ts`'s
 * own "zero witness calls per refused write" assertion, now proven against a
 * REAL transaction rather than an in-memory call counter:
 * `postgres-tenant-admin-repository.postgres.test.ts`'s own "task 10.6"
 * describe block passes a witness that performs a REAL `audit_entries`
 * INSERT through `exec`, so a refused write leaving `audit_entries` empty is
 * proof the witness never ran, not merely that a counter stayed at zero.
 *
 * `mutate` itself may also THROW (an unexpected, non-refusal failure —
 * `mapUniqueViolation`'s own "anything else must reach the caller unchanged"
 * branch): that path rolls back identically to a throwing witness, since
 * either way nothing this transaction touched should survive it.
 */
async function withTransactionalWitness<T extends TenantWriteResult>(pool: Pool, w: WriteWitness, mutate: (client: PoolClient) => Promise<T>): Promise<T> {
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

export function createPostgresTenantAdminRepository(pool: Pool): TenantAdminRepository {
  return {
    async list() {
      const { rows } = await pool.query<TenantRow>(`SELECT ${SELECT_COLUMNS} FROM tenants ORDER BY id`);
      return rows.map(toTenantRecord);
    },
    async findById(id) {
      const { rows } = await pool.query<TenantRow>(`SELECT ${SELECT_COLUMNS} FROM tenants WHERE id = $1`, [id]);
      return rows[0] === undefined ? undefined : toTenantRecord(rows[0]);
    },
    async create(draft, w: WriteWitness) {
      return withTransactionalWitness(pool, w, async (client) => {
        const { theme, violations } = sanitizeTenantTheme(draft.theme);
        try {
          const { rows } = await client.query<TenantRow>(
            `INSERT INTO tenants (id, embed_key, allowed_origins, entitled_games, theme)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING ${SELECT_COLUMNS}`,
            [draft.id, draft.embedKey, draft.allowedOrigins, draft.entitledGames, theme === undefined ? null : JSON.stringify(theme)],
          );
          return { ok: true, tenant: toTenantRecord(rows[0]!), themeViolations: violations };
        } catch (error) {
          return mapUniqueViolation(error);
        }
      });
    },
    async updateAllowedOrigins(id, allowedOrigins, w) {
      return withTransactionalWitness(pool, w, async (client) => {
        const { rows } = await client.query<TenantRow>(
          `UPDATE tenants SET allowed_origins = $2, updated_at = now() WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
          [id, allowedOrigins],
        );
        if (rows[0] === undefined) return { ok: false, reason: "unknown-tenant" };
        return { ok: true, tenant: toTenantRecord(rows[0]), themeViolations: [] };
      });
    },
    async updateEntitledGames(id, entitledGames, w) {
      return withTransactionalWitness(pool, w, async (client) => {
        const { rows } = await client.query<TenantRow>(
          `UPDATE tenants SET entitled_games = $2, updated_at = now() WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
          [id, entitledGames],
        );
        if (rows[0] === undefined) return { ok: false, reason: "unknown-tenant" };
        return { ok: true, tenant: toTenantRecord(rows[0]), themeViolations: [] };
      });
    },
    async updateTheme(id, theme, w) {
      return withTransactionalWitness(pool, w, async (client) => {
        const { theme: sanitized, violations } = sanitizeTenantTheme(theme);
        const { rows } = await client.query<TenantRow>(
          `UPDATE tenants SET theme = $2, updated_at = now() WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
          [id, sanitized === undefined ? null : JSON.stringify(sanitized)],
        );
        if (rows[0] === undefined) return { ok: false, reason: "unknown-tenant" };
        return { ok: true, tenant: toTenantRecord(rows[0]), themeViolations: violations };
      });
    },
    async rotateEmbedKey(id, embedKey, w) {
      return withTransactionalWitness(pool, w, async (client) => {
        try {
          const { rows } = await client.query<TenantRow>(
            `UPDATE tenants SET embed_key = $2, updated_at = now() WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
            [id, embedKey],
          );
          if (rows[0] === undefined) return { ok: false, reason: "unknown-tenant" };
          return { ok: true, tenant: toTenantRecord(rows[0]), themeViolations: [] };
        } catch (error) {
          return mapUniqueViolation(error);
        }
      });
    },
    // `isWindowOrdered` is the PRIMARY enforcer, checked BEFORE even opening
    // a transaction — migration 002's `tenants_window_ordered` CHECK is
    // defense-in-depth for a write reaching this table through some other
    // path, not the mechanism this method itself relies on (see that
    // migration's own docstring). `new Date(ms)`/`null`: the write-side half
    // of design §3's "adapters convert `timestamptz` ↔ `Date` ↔
    // `.getTime()`" — `node-postgres` serializes a `Date` as a proper
    // `timestamptz` literal, never a hand-built string.
    async setValidityWindow(id, window, w) {
      if (!isWindowOrdered(window)) return { ok: false, reason: "invalid-window" };
      return withTransactionalWitness(pool, w, async (client) => {
        const { rows } = await client.query<TenantRow>(
          `UPDATE tenants SET valid_from = $2, valid_until = $3, updated_at = now() WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
          [id, window.validFrom === undefined ? null : new Date(window.validFrom), window.validUntil === undefined ? null : new Date(window.validUntil)],
        );
        if (rows[0] === undefined) return { ok: false, reason: "unknown-tenant" };
        return { ok: true, tenant: toTenantRecord(rows[0]), themeViolations: [] };
      });
    },
  };
}
