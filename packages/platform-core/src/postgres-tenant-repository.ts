import type { Pool } from "pg";
import type { ThemeOverride } from "@hexdev/widget-protocol";
import type { TenantId, TenantRecord, TenantRepository } from "./tenant-auth.js";
import { sanitizeTenantTheme } from "./tenant-theme.js";

/**
 * Postgres-backed `TenantRepository` (design §1.4/§1.5/§2.1, decision 4):
 * `mint-server`/`server` (PR4) construct this against a `Pool` held under
 * `convite_readonly` (design §4) — `SELECT` on `tenants`, nothing else, on
 * nothing else. `import type { Pool } from "pg"` is type-only and erased at
 * build, mirroring `redis-rate-limiter.ts:1`'s `import type { Redis } from
 * "ioredis"`; the ONE value import of `pg` in this package stays confined to
 * `postgres-client.ts` (decision 1.5).
 *
 * THEME SANITIZATION AT READ TIME — SETTLED, PR5: kept as defense-in-depth,
 * not removed as redundant. PR3 (this adapter's own first landing) called
 * this an explicit, temporary decision because it shipped with no write port
 * at all; task 4.9 asked PR5 to revisit it now that
 * `TenantAdminRepository.create`/`updateTheme` (`tenant-admin.ts`) validate a
 * theme once, at write time, through the SAME shared `sanitizeTenantTheme`
 * (`tenant-theme.ts`). The reason this stays rather than drops: the write
 * port is not the only way a row reaches `tenants`. `scripts/dev-stack.mjs`
 * (PR4d) and the e2e harness (`e2e/support/system.ts`, PR4e) both still
 * INSERT/UPSERT a tenant row directly against Postgres, bypassing
 * `TenantAdminRepository` entirely and by design — neither is a route
 * `apps/admin` will ever serve, so neither should have to go through it. A
 * hostile theme value seeded through either of those two still-live raw-SQL
 * paths would render unfiltered on a tenant's own embed page if this read
 * pass were removed. Kept, deliberately WITHOUT the `console.warn` the write
 * port surfaces via `themeViolations` instead (see `tenant-admin.ts`'s own
 * docstring): a warning on every request for a value already sitting in the
 * datastore would be per-request log noise, and the write path is what an
 * operator actually reads a violation report from now.
 */
function sanitizeThemeFromStorage(theme: unknown): ThemeOverride | undefined {
  return sanitizeTenantTheme(theme).theme;
}

export interface TenantRow {
  readonly id: string;
  readonly embed_key: string;
  readonly allowed_origins: readonly string[];
  readonly entitled_games: readonly string[];
  readonly theme: unknown;
  /** `timestamptz` columns (migration 002) — `node-postgres` decodes these
   * as `Date | null`, never a string, so `toTenantRecord` below converts
   * `Date` → `.getTime()` exactly once, in the ONE place both adapters
   * share (design §3: "adapters convert `timestamptz` ↔ `Date` ↔
   * `.getTime()`"). */
  readonly valid_from: Date | null;
  readonly valid_until: Date | null;
}

export const SELECT_COLUMNS = "id, embed_key, allowed_origins, entitled_games, theme, valid_from, valid_until";

/**
 * Exported (not merely module-private) so `postgres-tenant-admin-repository.ts`
 * (tenant-administration slice 4) maps its own `RETURNING` rows through the
 * IDENTICAL logic — one row shape, one place that knows it, rather than a
 * second hand-copied mapper drifting from this one the next time a column is
 * added.
 */
export function toTenantRecord(row: TenantRow): TenantRecord {
  return {
    id: row.id as TenantId,
    embedKey: row.embed_key,
    allowedOrigins: row.allowed_origins,
    entitledGames: row.entitled_games,
    theme: sanitizeThemeFromStorage(row.theme),
    validFrom: row.valid_from === null ? undefined : row.valid_from.getTime(),
    validUntil: row.valid_until === null ? undefined : row.valid_until.getTime(),
  };
}

export function createPostgresTenantRepository(pool: Pool): TenantRepository {
  return {
    // No try/catch, on purpose: `pool.query`'s own rejection IS the correct
    // outcome for a failed query and must reach the caller unchanged — see
    // this module's own docstring (design §1.10). `rows[0] === undefined`
    // is the ONLY path that means "no such tenant"; it is reached exclusively
    // when the query itself succeeded and returned zero rows.
    async findByEmbedKey(embedKey) {
      const { rows } = await pool.query<TenantRow>(`SELECT ${SELECT_COLUMNS} FROM tenants WHERE embed_key = $1`, [embedKey]);
      return rows[0] === undefined ? undefined : toTenantRecord(rows[0]);
    },
    async findById(tenantId) {
      const { rows } = await pool.query<TenantRow>(`SELECT ${SELECT_COLUMNS} FROM tenants WHERE id = $1`, [tenantId]);
      return rows[0] === undefined ? undefined : toTenantRecord(rows[0]);
    },
  };
}
