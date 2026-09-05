import type { Pool } from "pg";
import type { OperatorId } from "./operator-repository.js";

/**
 * `listOperatorsWithPermissions` (spec Domain K, design §6.1, task 16a.1) —
 * a standalone Postgres-bound READ, the identical "no port, no static
 * double when the mechanism is unavoidably Postgres-native" precedent
 * `postgres-operator-authorization.ts`'s own docstring already sets for
 * `findOperatorAuthorizationContext`: `OperatorRepository`'s own static
 * in-memory adapter tracks neither `operator_permissions` nor
 * `operator_sessions` (`operator-repository.ts`'s own docstring), so a
 * method returning a permission set per operator has no faithful in-memory
 * counterpart either.
 *
 * ONE ROUND TRIP for the WHOLE operator directory, never N+1: the SAME
 * `array_agg` + `LEFT JOIN` + `coalesce` shape `AUTHORIZATION_QUERY`
 * (`postgres-operator-authorization.ts`) already establishes for a single
 * operator's own session-bound row, widened here to every operator at once.
 * This is what lets the panel's own operator list (task 16a.1) AND its
 * permission matrix (task 16a.6, rows = operators, columns = the seven
 * `PERMISSIONS`) share ONE fetch (`GET /operators`) — the matrix needs
 * exactly the same per-operator permission set the list's own row already
 * carries, so a second round trip would only duplicate this query.
 *
 * `coalesce(array_agg(...) FILTER (...), '{}')`: the identical NULL-vs-
 * empty-array trap `AUTHORIZATION_QUERY`'s own docstring already names — a
 * `LEFT JOIN` finding no permission rows for an operator makes `array_agg`
 * return SQL `NULL`, not `[]`, so `coalesce` is load-bearing here for the
 * exact same reason.
 *
 * `ORDER BY o.username` — deterministic across calls, so a re-fetch after a
 * grant/revoke/disable/enable does not visually reshuffle rows the operator
 * was not looking at.
 */
const LIST_OPERATORS_QUERY = `
  SELECT o.id, o.username, o.enabled,
         coalesce(array_agg(p.permission) FILTER (WHERE p.permission IS NOT NULL), '{}') AS permissions
  FROM operators o
  LEFT JOIN operator_permissions p ON p.operator_id = o.id
  GROUP BY o.id, o.username, o.enabled
  ORDER BY o.username
`;

export interface OperatorDirectoryEntry {
  readonly id: OperatorId;
  readonly username: string;
  readonly enabled: boolean;
  readonly permissions: readonly string[];
}

interface OperatorDirectoryRow {
  readonly id: string;
  readonly username: string;
  readonly enabled: boolean;
  readonly permissions: readonly string[];
}

export async function listOperatorsWithPermissions(pool: Pool): Promise<readonly OperatorDirectoryEntry[]> {
  const { rows } = await pool.query<OperatorDirectoryRow>(LIST_OPERATORS_QUERY);
  return rows.map((row) => ({ id: row.id as OperatorId, username: row.username, enabled: row.enabled, permissions: row.permissions }));
}
