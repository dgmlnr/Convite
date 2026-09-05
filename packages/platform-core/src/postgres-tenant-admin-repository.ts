import type { Pool } from "pg";
import { SELECT_COLUMNS, toTenantRecord, type TenantRow } from "./postgres-tenant-repository.js";
import { NOOP_EXEC, type TenantAdminRepository, type TenantWriteResult, type WriteWitness } from "./tenant-admin.js";
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
 * WriteWitness: called with a NO-OP `exec` on every successful write, per
 * `tenant-admin.ts`'s own docstring — the real transactional coupling with
 * an audit INSERT lands in PR12 (task 10.6), not here.
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
      const { theme, violations } = sanitizeTenantTheme(draft.theme);
      try {
        const { rows } = await pool.query<TenantRow>(
          `INSERT INTO tenants (id, embed_key, allowed_origins, entitled_games, theme)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING ${SELECT_COLUMNS}`,
          [draft.id, draft.embedKey, draft.allowedOrigins, draft.entitledGames, theme === undefined ? null : JSON.stringify(theme)],
        );
        await w(NOOP_EXEC);
        return { ok: true, tenant: toTenantRecord(rows[0]!), themeViolations: violations };
      } catch (error) {
        return mapUniqueViolation(error);
      }
    },
    async updateAllowedOrigins(id, allowedOrigins, w) {
      const { rows } = await pool.query<TenantRow>(
        `UPDATE tenants SET allowed_origins = $2, updated_at = now() WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
        [id, allowedOrigins],
      );
      if (rows[0] === undefined) return { ok: false, reason: "unknown-tenant" };
      await w(NOOP_EXEC);
      return { ok: true, tenant: toTenantRecord(rows[0]), themeViolations: [] };
    },
    async updateEntitledGames(id, entitledGames, w) {
      const { rows } = await pool.query<TenantRow>(
        `UPDATE tenants SET entitled_games = $2, updated_at = now() WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
        [id, entitledGames],
      );
      if (rows[0] === undefined) return { ok: false, reason: "unknown-tenant" };
      await w(NOOP_EXEC);
      return { ok: true, tenant: toTenantRecord(rows[0]), themeViolations: [] };
    },
    async updateTheme(id, theme, w) {
      const { theme: sanitized, violations } = sanitizeTenantTheme(theme);
      const { rows } = await pool.query<TenantRow>(
        `UPDATE tenants SET theme = $2, updated_at = now() WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
        [id, sanitized === undefined ? null : JSON.stringify(sanitized)],
      );
      if (rows[0] === undefined) return { ok: false, reason: "unknown-tenant" };
      await w(NOOP_EXEC);
      return { ok: true, tenant: toTenantRecord(rows[0]), themeViolations: violations };
    },
    async rotateEmbedKey(id, embedKey, w) {
      try {
        const { rows } = await pool.query<TenantRow>(
          `UPDATE tenants SET embed_key = $2, updated_at = now() WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
          [id, embedKey],
        );
        if (rows[0] === undefined) return { ok: false, reason: "unknown-tenant" };
        await w(NOOP_EXEC);
        return { ok: true, tenant: toTenantRecord(rows[0]), themeViolations: [] };
      } catch (error) {
        return mapUniqueViolation(error);
      }
    },
    // `isWindowOrdered` is the PRIMARY enforcer, checked before any query —
    // migration 002's `tenants_window_ordered` CHECK is defense-in-depth for
    // a write reaching this table through some other path, not the mechanism
    // this method itself relies on (see that migration's own docstring).
    // `new Date(ms)`/`null`: the write-side half of design §3's "adapters
    // convert `timestamptz` ↔ `Date` ↔ `.getTime()`" — `node-postgres`
    // serializes a `Date` as a proper `timestamptz` literal, never a
    // hand-built string.
    async setValidityWindow(id, window, w) {
      if (!isWindowOrdered(window)) return { ok: false, reason: "invalid-window" };
      const { rows } = await pool.query<TenantRow>(
        `UPDATE tenants SET valid_from = $2, valid_until = $3, updated_at = now() WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
        [id, window.validFrom === undefined ? null : new Date(window.validFrom), window.validUntil === undefined ? null : new Date(window.validUntil)],
      );
      if (rows[0] === undefined) return { ok: false, reason: "unknown-tenant" };
      await w(NOOP_EXEC);
      return { ok: true, tenant: toTenantRecord(rows[0]), themeViolations: [] };
    },
  };
}
