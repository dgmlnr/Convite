import type { Pool } from "pg";
import { sanitizeThemeOverride, validateThemeContrast, type ThemeOverride } from "@hexdev/widget-protocol";
import type { TenantId, TenantRecord, TenantRepository } from "./tenant-auth.js";

/**
 * Postgres-backed `TenantRepository` (design §1.4/§1.5/§2.1, decision 4):
 * `mint-server`/`server` (PR4) construct this against a `Pool` held under
 * `convite_readonly` (design §4) — `SELECT` on `tenants`, nothing else, on
 * nothing else. `import type { Pool } from "pg"` is type-only and erased at
 * build, mirroring `redis-rate-limiter.ts:1`'s `import type { Redis } from
 * "ioredis"`; the ONE value import of `pg` in this package stays confined to
 * `postgres-client.ts` (decision 1.5).
 *
 * THEME SANITIZATION AT READ TIME — an explicit, temporary decision, not a
 * silent drop of the behavior `createStaticTenantRepository` already has.
 * Design §2.3/task 4.9 moves sanitization to WRITE time once
 * `TenantAdminRepository` lands (PR5): a write validates once, and every
 * later read simply trusts the stored value. This PR ships a READ-ONLY
 * adapter with no write port at all, so a row can only reach `tenants`
 * through a raw seed script or a migration — neither validates anything.
 * Trusting `theme jsonb` as-is here would mean a hostile value seeded
 * outside the (not-yet-existing) write path renders unfiltered on a
 * tenant's own embed page — exactly the CSS-injection
 * `createStaticTenantRepository`'s own construction-time sanitizer exists to
 * stop. So this reads it through the SAME two `@hexdev/widget-protocol`
 * primitives that function calls (`sanitizeThemeOverride` +
 * `validateThemeContrast`), but deliberately WITHOUT its `console.warn`:
 * that warning fires once, at boot, for a config file an operator can fix in
 * one place; warning on every REQUEST for a value already sitting in the
 * datastore would be per-request log noise with no new information, for a
 * state PR5 makes structurally unreachable anyway (a write that fails
 * contrast validation never commits a hostile value in the first place, so
 * there is nothing left here to warn ABOUT once PR5 lands). PR5 can then
 * decide whether this read-time pass becomes pure defense-in-depth or is
 * removed as redundant — not a question this PR answers for it.
 */
function sanitizeThemeFromStorage(theme: unknown): ThemeOverride | undefined {
  if (theme === null || typeof theme !== "object") return undefined;
  return validateThemeContrast(sanitizeThemeOverride(theme as Readonly<Record<string, unknown>>)).theme;
}

interface TenantRow {
  readonly id: string;
  readonly embed_key: string;
  readonly allowed_origins: readonly string[];
  readonly entitled_games: readonly string[];
  readonly theme: unknown;
}

const SELECT_COLUMNS = "id, embed_key, allowed_origins, entitled_games, theme";

function toTenantRecord(row: TenantRow): TenantRecord {
  return {
    id: row.id as TenantId,
    embedKey: row.embed_key,
    allowedOrigins: row.allowed_origins,
    entitledGames: row.entitled_games,
    theme: sanitizeThemeFromStorage(row.theme),
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
