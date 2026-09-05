import type { AuditAction } from "./audit-log.js";

/**
 * The audit viewer's own read side (spec Domain L, design §9/§10, task
 * 16b.2) — the SIBLING of `audit-log.ts`'s write side, deliberately kept in
 * `apps/admin`, NOT `platform-core`, for the identical reason design §10's
 * own closing argument gives for the write side: `convite_readonly` (the
 * role `mint-server`/`server` hold) has no `SELECT` on `audit_entries`
 * either (design §4's own role table), so a read function reachable from
 * `platform-core`'s public surface would compile cleanly and only fail at
 * runtime with a permission error — exactly the "the layering fence only
 * works if the module sits somewhere it can enumerate" argument that keeps
 * the write side out of `platform-core` too.
 *
 * `AuditQueryExec` is a NARROW STRUCTURAL TYPE, never `pg`'s own `Pool` —
 * the identical discipline `audit-log.ts`'s own `AuditExec` already
 * establishes for the write side, and the reason this module needs no new
 * `.dependency-cruiser.cjs` rule: `apps/admin` never value-imports `pg`
 * anywhere, so `no-pg-outside-platform-core` (already in place) has nothing
 * new to catch here. `index.ts` binds the real implementation as
 * `(sql, values) => postgresPool.query(sql, values)`, structurally
 * satisfying this type with no import of `pg` in that file either.
 */
export type AuditQueryExec = (sql: string, values: readonly unknown[]) => Promise<{ readonly rows: readonly AuditEntryQueryRow[] }>;

interface AuditEntryQueryRow {
  readonly id: number;
  readonly occurred_at: Date;
  readonly actor_username: string;
  readonly action: string;
  readonly target_tenant_id: string | null;
  readonly target_operator_id: string | null;
  readonly changes: unknown;
}

/**
 * Domain L's own four filters: acting operator, target tenant, action type,
 * and a date range. `action` is a plain `string` here, never `AuditAction` —
 * this module trusts whatever it is handed (the SAME "platform-core never
 * learns the closed vocabulary, one layer up validates it" placement
 * `operator-permissions.ts`'s own docstring establishes for `permission`);
 * `audit-handlers.ts` is the ONE place an incoming query-string value is
 * checked against `AUDIT_ACTIONS` before it ever reaches this function.
 */
export interface AuditQueryFilters {
  readonly actorUsername?: string;
  readonly targetTenantId?: string;
  readonly action?: string;
  /** Epoch ms, inclusive lower bound. */
  readonly occurredFrom?: number;
  /** Epoch ms, exclusive upper bound. */
  readonly occurredTo?: number;
}

export interface AuditEntryRow {
  readonly id: number;
  readonly occurredAt: number;
  readonly actorUsername: string;
  readonly action: AuditAction;
  readonly targetTenantId?: string;
  readonly targetOperatorId?: string;
  readonly changes?: Readonly<Record<string, { readonly before: unknown; readonly after: unknown }>>;
}

/** The newest N entries matching the filters — a deliberate simplification,
 * disclosed rather than hidden: Domain L names no pagination requirement,
 * and this panel's own single-digit-operator/tenant scale (design §7) makes
 * a hard cap simpler than building pagination for a requirement nobody
 * asked for. Raising this later is a one-line change, not a migration. */
const MAX_ENTRIES = 200;

/**
 * Builds ONE parameterized `SELECT`, never string interpolation for any
 * filter value (threat matrix, the same discipline every write adapter in
 * `platform-core` already follows) — `$1`, `$2`, ... are the ONLY places a
 * filter value appears in the query text, so a hostile value round-trips
 * as literal data rather than executing. `MAX_ENTRIES` is the sole
 * interpolated literal, a constant this module controls itself, never
 * caller input.
 */
export async function listAuditEntries(exec: AuditQueryExec, filters: AuditQueryFilters): Promise<readonly AuditEntryRow[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.actorUsername !== undefined) {
    values.push(filters.actorUsername);
    conditions.push(`actor_username = $${String(values.length)}`);
  }
  if (filters.targetTenantId !== undefined) {
    values.push(filters.targetTenantId);
    conditions.push(`target_tenant_id = $${String(values.length)}`);
  }
  if (filters.action !== undefined) {
    values.push(filters.action);
    conditions.push(`action = $${String(values.length)}`);
  }
  if (filters.occurredFrom !== undefined) {
    values.push(new Date(filters.occurredFrom));
    conditions.push(`occurred_at >= $${String(values.length)}`);
  }
  if (filters.occurredTo !== undefined) {
    values.push(new Date(filters.occurredTo));
    conditions.push(`occurred_at < $${String(values.length)}`);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await exec(
    `SELECT id, occurred_at, actor_username, action, target_tenant_id, target_operator_id, changes
       FROM audit_entries${where}
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${String(MAX_ENTRIES)}`,
    values,
  );

  return rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at.getTime(),
    actorUsername: row.actor_username,
    action: row.action as AuditAction,
    targetTenantId: row.target_tenant_id ?? undefined,
    targetOperatorId: row.target_operator_id ?? undefined,
    changes: (row.changes as AuditEntryRow["changes"] | null) ?? undefined,
  }));
}
