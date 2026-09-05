import type { OperatorId, TenantId } from "@hexdev/platform-core";

/**
 * THE CLOSED AUDIT-ACTION VOCABULARY (design §9, spec Domain L) — sixteen
 * members, one per operator-triggered mutation this change and the two
 * following account-management/RBAC slices define. CLOSED, not a bare
 * `string`, because its closure is load-bearing for the boundary design §10
 * and spec Domain L both state — deliberately twice, once from each side, so
 * neither can drift while the other is read alone: a tenant runtime refusal
 * (Domain D) has no member here to map to, because it is not an operator
 * action at all. Persisting one would require BOTH adding a member to this
 * union AND fabricating a non-existent `AuthorizedOperator` for the
 * non-nullable `actor_operator_id` column (migration 004) — two deliberate
 * edits that show up plainly in a diff, never an accident (design §10
 * layer 1, the compile-time layer).
 */
/**
 * A `const` array, not a bare union type (task 16b.2's own audit viewer) —
 * the SAME "three consumers need it as a VALUE" argument `permissions.ts`'s
 * own `PERMISSIONS` docstring already makes for a different closed
 * vocabulary. `audit-query.ts`'s own action filter validates an incoming
 * query-string value against membership, so the filter's vocabulary CANNOT
 * drift from this real closed set — a union type alone cannot be validated
 * against at runtime. `audit-log.test.ts` still scans for the literal INSERT
 * text only; this addition touches no INSERT site.
 */
export const AUDIT_ACTIONS = [
  "tenant.created",
  "tenant.origins.updated",
  "tenant.games.updated",
  "tenant.theme.updated",
  "tenant.window.updated",
  "tenant.embed-key.rotated",
  "operator.bootstrapped",
  "operator.created",
  "operator.disabled",
  "operator.enabled",
  "operator.password.changed",
  "operator.password.reset-by-cli",
  "permission.granted",
  "permission.revoked",
  "session.login",
  "session.logout",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** One changed field's before/after pair (migration 004's `changes jsonb`
 * column). Per spec assumption 4, populated only for state-mutating
 * actions — `session.login`/`session.logout` entries carry `changes:
 * undefined`, since there is no field to diff for either. */
export interface AuditEntryChange {
  readonly before: unknown;
  readonly after: unknown;
}

/**
 * Everything one audit row needs. `occurredAt` is an EPOCH-MS INSTANT THE
 * CALLER ALREADY RESOLVED THROUGH ITS OWN INJECTED `Clock` — this module
 * never reads `Date.now()` and never lets Postgres compute `now()` for this
 * column (migration 004's own column comment: "injected Clock, never
 * now()"), the identical "compare/stamp through `Clock`, never a bare
 * wall-clock read" discipline `tenant-validity.ts`'s choke points already
 * establish for a different column. `actorOperatorId`/`actorUsername` are
 * BOTH required — migration 004's `actor_operator_id text NOT NULL`, design
 * §6.3's own closing argument: there is no anonymous audit entry, by
 * construction, because the only value that can ever fill this field is the
 * `AuthorizedOperator` slice 9's checkpoint mints.
 */
export interface AuditEntryInput {
  readonly occurredAt: number;
  readonly actorOperatorId: OperatorId;
  readonly actorUsername: string;
  readonly action: AuditAction;
  readonly targetTenantId?: TenantId;
  readonly targetOperatorId?: OperatorId;
  readonly changes?: Readonly<Record<string, AuditEntryChange>>;
}

/**
 * The exact shape `TenantAdminRepository`'s own `WriteWitness`
 * (`@hexdev/platform-core`'s `tenant-admin.ts`) hands its callback —
 * declared locally, not imported, because `platform-core` never exports
 * this callback type publicly: no port in that package needs to name
 * `apps/admin`'s own audit vocabulary, and TypeScript's structural typing
 * needs no shared declaration for `(exec) => appendAuditEntry(exec, ...)`
 * to satisfy `WriteWitness` at every call site that builds one this way.
 */
export type AuditExec = (sql: string, values: readonly unknown[]) => Promise<void>;

/**
 * THE ONLY MODULE THAT MAY ISSUE AN `audit_entries` INSERT (tasks
 * 10.4/10.5). Mechanically enforced by this file's own `audit-log.test.ts`
 * — a source-text scan across every production `.ts` file in `packages/`
 * and `apps/` asserting the literal INSERT text appears in exactly this one
 * file — the SAME "scan for the symbol/text that can actually PRODUCE the
 * effect, not merely for a type reference" precision
 * `composition-root-least-privilege.test.ts` already established for
 * `TenantAdminRepository`'s own two constructing symbols.
 *
 * Column order matches migration 004 exactly. `target_tenant_id`/
 * `target_operator_id`/`changes` are nullable columns — `?? null`, never a
 * bare `undefined`, because `pg` throws on an `undefined` query parameter
 * rather than silently serializing it as SQL `NULL`.
 *
 * This function is the ONE place `WriteWitness`'s callback is called with
 * real SQL (task 10.6): every call site builds a `WriteWitness` as
 * `(exec) => appendAuditEntry(exec, {...})`, so the transactional coupling
 * `postgres-tenant-admin-repository.ts` now provides (the mutation and this
 * INSERT commit or roll back together, on the SAME connection) applies to
 * every audit entry this app will ever write, with no second code path to
 * keep in sync.
 */
export async function appendAuditEntry(exec: AuditExec, entry: AuditEntryInput): Promise<void> {
  await exec(
    `INSERT INTO audit_entries
       (occurred_at, actor_operator_id, actor_username, action, target_tenant_id, target_operator_id, changes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      new Date(entry.occurredAt),
      entry.actorOperatorId,
      entry.actorUsername,
      entry.action,
      entry.targetTenantId ?? null,
      entry.targetOperatorId ?? null,
      entry.changes === undefined ? null : JSON.stringify(entry.changes),
    ],
  );
}
