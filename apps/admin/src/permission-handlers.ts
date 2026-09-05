import type { OperatorId, OperatorMutationResult, RevokePermissionGuardedResult } from "@hexdev/platform-core";
import type { AdminHandler, AuthorizedOperator } from "./authorization.js";
import { appendAuditEntry, type AuditEntryInput } from "./audit-log.js";
import { PERMISSIONS, type Permission } from "./permissions.js";

/**
 * `POST /operators/:id/permissions/grant`, `POST /operators/:id/permissions/revoke`
 * (spec Domain K, design §6.2/§8, tasks 12.1-12.6) — both behind
 * `operators.manage` (design §6.2's route table, already wired since PR8b).
 * `grantPermission`/`revokePermission` are injected as plain FUNCTIONS, not a
 * port (`@hexdev/platform-core`'s own `operator-permissions.ts` docstring
 * explains why they are standalone Postgres-bound exports) — the identical DI
 * seam `operator-handlers.ts` already establishes for
 * `disableOperator`/`enableOperator`, so this module's own tests can prove
 * the HTTP-level wiring without a real Postgres connection. The REAL
 * advisory-lock guard reuse and cross-table atomicity are proven against
 * real Postgres in `operator-permissions.postgres.test.ts` — this module
 * trusts that proof rather than re-deriving it with a fake.
 *
 * `isPermission` is THE MASS-ASSIGNMENT FENCE (threat matrix, task 12.1):
 * `platform-core`'s own `grantPermission`/`revokePermission` never learn the
 * closed `PERMISSIONS` vocabulary (`operator-permissions.ts`'s own
 * docstring), so this module is the ONLY place a request body's
 * `permission` field is checked against it — a request naming
 * `"tenant.*"` or any invented string is refused HERE, before either
 * Postgres-bound function is ever called, never merely filtered client-side
 * where a raw request could bypass it. Genuinely proven RED first: an
 * earlier version of this file forwarded `req.body.permission` unchecked,
 * and `permission-handlers.test.ts`'s own mass-assignment cases failed for
 * real (200, not 400, `grantPermission`/`revokePermission` both invoked)
 * before this check was added.
 */
type ExecFn = (sql: string, values: readonly unknown[]) => Promise<void>;

export interface PermissionHandlersDeps {
  readonly grantPermission: (operatorId: OperatorId, permission: Permission, grantedBy: OperatorId, w: (exec: ExecFn) => Promise<void>) => Promise<OperatorMutationResult>;
  readonly revokePermission: (operatorId: OperatorId, permission: Permission, w: (exec: ExecFn) => Promise<void>) => Promise<RevokePermissionGuardedResult>;
  readonly clock?: () => number;
}

function operatorIdParam(req: { readonly params?: Readonly<Record<string, string>> }): OperatorId | undefined {
  const id = req.params?.id;
  return id === undefined || id === "" ? undefined : (id as OperatorId);
}

function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}

function permissionAuditWitness(deps: PermissionHandlersDeps, actor: AuthorizedOperator, entry: Omit<AuditEntryInput, "occurredAt" | "actorOperatorId" | "actorUsername">) {
  return async (exec: ExecFn) =>
    appendAuditEntry(exec, {
      occurredAt: (deps.clock ?? Date.now)(),
      actorOperatorId: actor.id,
      actorUsername: actor.username,
      ...entry,
    });
}

/**
 * Task 12.1/12.2: grants `permission` to the target operator. Refuses
 * (400, before `grantPermission` is ever called) a permission string outside
 * the closed taxonomy — see this file's own header for the genuine RED that
 * proved this check load-bearing. `unknown-operator` maps to 404, the same
 * discriminated-refusal class `operator-handlers.ts`'s own disable/enable
 * handlers already establish for a form-reachable failure.
 */
export function createPermissionGrantHandler(deps: PermissionHandlersDeps): AdminHandler {
  return async (req, actor) => {
    const targetId = operatorIdParam(req);
    if (targetId === undefined) return { status: 400, body: JSON.stringify({ error: "missing-operator-id" }) };
    const permission = req.body?.permission;
    if (!isPermission(permission)) return { status: 400, body: JSON.stringify({ error: "invalid-permission" }) };

    const witness = permissionAuditWitness(deps, actor, { action: "permission.granted", targetOperatorId: targetId, changes: { permission: { before: null, after: permission } } });
    const result = await deps.grantPermission(targetId, permission, actor.id, witness);

    if (!result.ok) return { status: 404, body: JSON.stringify({ error: result.reason }) };
    return { status: 200, body: JSON.stringify({ ok: true }) };
  };
}

/**
 * Task 12.5/12.6: revokes `permission` from the target operator, routed
 * through `revokePermission` — which itself reuses
 * `withLastAccountManagerGuard` regardless of which permission is named
 * (`operator-permissions.ts`'s own docstring). `last-account-manager` maps
 * to 409 (a real, expected refusal a form can render — same class as
 * `operator-handlers.ts`'s own disable handler); `not-granted` to 404.
 */
export function createPermissionRevokeHandler(deps: PermissionHandlersDeps): AdminHandler {
  return async (req, actor) => {
    const targetId = operatorIdParam(req);
    if (targetId === undefined) return { status: 400, body: JSON.stringify({ error: "missing-operator-id" }) };
    const permission = req.body?.permission;
    if (!isPermission(permission)) return { status: 400, body: JSON.stringify({ error: "invalid-permission" }) };

    const witness = permissionAuditWitness(deps, actor, { action: "permission.revoked", targetOperatorId: targetId, changes: { permission: { before: permission, after: null } } });
    const result = await deps.revokePermission(targetId, permission, witness);

    if (!result.ok) {
      return { status: result.reason === "last-account-manager" ? 409 : 404, body: JSON.stringify({ error: result.reason }) };
    }
    return { status: 200, body: JSON.stringify({ ok: true }) };
  };
}
