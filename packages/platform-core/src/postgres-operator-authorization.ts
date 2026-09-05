import type { Pool } from "pg";
import type { OperatorAuthorizationContext } from "./operator-authorization.js";
import type { OperatorId } from "./operator-repository.js";

/**
 * The authorization checkpoint's ONE-QUERY JOIN (design §7, spec Domain K,
 * task 9.2) — resolves session validity, account state, and the FULL
 * permission set in a SINGLE round trip. This is what makes "no cache, no
 * TTL" possible at all (design §7's own cost table): `authorize`
 * (`apps/admin/src/authorization.ts`) calls this exactly once per guarded
 * request and never memoizes the result, so a revoked permission or a
 * disabled account bites on the very next request, with nothing to
 * invalidate — the propagation window IS the cache, design §7's own phrase.
 *
 * Lives inside `packages/platform-core/src` — no new `.dependency-cruiser.cjs`
 * rule needed (tasks §0.4, confirmed again here); `import type { Pool } from
 * "pg"` is type-only, erased at build (decision 1.5); the ONE value import of
 * `pg` stays confined to `postgres-client.ts`.
 *
 * `coalesce(array_agg(...) FILTER (WHERE ...), '{}')`: `array_agg` over zero
 * matching rows (the `LEFT JOIN` finding nothing) returns SQL `NULL`, not an
 * empty array — `FILTER` does not change that. `coalesce` converts that
 * `NULL` into a real empty array, so a freshly created operator with zero
 * grants (spec Domain K's own default) resolves to `permissions: []`, never
 * `[null]`, which `.includes(...)` would then have to defend against forever.
 */
const AUTHORIZATION_QUERY = `
  SELECT o.id, o.username, o.enabled, s.expires_at,
         coalesce(array_agg(p.permission) FILTER (WHERE p.permission IS NOT NULL), '{}') AS permissions
  FROM operator_sessions s
  JOIN operators o ON o.id = s.operator_id
  LEFT JOIN operator_permissions p ON p.operator_id = o.id
  WHERE s.token_hash = $1
  GROUP BY o.id, o.username, o.enabled, s.expires_at
`;

interface AuthorizationRow {
  readonly id: string;
  readonly username: string;
  readonly enabled: boolean;
  readonly expires_at: Date;
  readonly permissions: readonly string[];
}

/**
 * `tokenHash` is always this app's own `hashSessionToken` output (a fixed
 * 64-char hex digest) — never raw user input reaching this query
 * unvalidated, but parameterized regardless (threat matrix, same discipline
 * every write adapter in this package already follows since
 * `postgres-tenant-admin-repository.ts`'s own SQL-injection proof): `$1` is
 * the ONLY place `tokenHash` appears in the query text, so a hostile value
 * round-trips as literal data and matches no row, rather than executing.
 */
export async function findOperatorAuthorizationContext(pool: Pool, tokenHash: string): Promise<OperatorAuthorizationContext | undefined> {
  const { rows } = await pool.query<AuthorizationRow>(AUTHORIZATION_QUERY, [tokenHash]);
  const row = rows[0];
  if (row === undefined) return undefined;
  return { operatorId: row.id as OperatorId, username: row.username, enabled: row.enabled, expiresAt: row.expires_at.getTime(), permissions: row.permissions };
}
