import crypto from "node:crypto";
import type { OperatorDirectoryEntry, OperatorId, OperatorLifecycleGuardedResult, OperatorLifecycleResult, OperatorRepository } from "@hexdev/platform-core";
import type { AdminHandler, AuthorizedOperator } from "./authorization.js";
import { appendAuditEntry, type AuditEntryInput } from "./audit-log.js";
import { hashPassword } from "./operator-password.js";

/**
 * `POST /operators`, `POST /operators/:id/enable`, `POST /operators/:id/disable`
 * (spec Domain J, design §6.2, tasks 11a.1-11a.5/11a.8-11a.9) — all three
 * behind `operators.manage` (design §6.2's route table, already wired since
 * PR8b). The FIRST real handlers in `apps/admin` to construct a
 * `WriteWitness`-shaped closure as `(exec) => appendAuditEntry(exec, {...})`
 * — the exact shape PR12b's own docstring named in advance, now landing.
 *
 * `disableOperator`/`enableOperator` are injected as plain FUNCTIONS, not a
 * port (`@hexdev/platform-core`'s own `operator-lifecycle.ts` docstring
 * explains why they are standalone Postgres-bound exports rather than
 * `OperatorRepository` methods) — the identical DI seam
 * `authorization.ts`'s own `AuthorizationQuery` and `login-handler.ts`'s
 * `passwordDeps`/rate limiters already establish, so this module's own tests
 * can prove the HTTP-level wiring (status codes, audit witness construction)
 * without a real Postgres connection. The REAL last-account-manager guard
 * and session-invalidation mechanics are proven against real Postgres in
 * `packages/platform-core/src/operator-lifecycle.postgres.test.ts` — this
 * module trusts that proof rather than re-deriving it with a fake.
 */
export interface OperatorHandlersDeps {
  readonly operators: OperatorRepository;
  readonly disableOperator: (id: OperatorId, w: (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => Promise<void>) => Promise<OperatorLifecycleGuardedResult>;
  readonly enableOperator: (id: OperatorId, w: (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => Promise<void>) => Promise<OperatorLifecycleResult>;
  /** Task 16a.1: the operator directory `createOperatorListHandler` below
   * serves verbatim — `@hexdev/platform-core`'s own `listOperatorsWithPermissions`,
   * bound to this process's own pool in `index.ts`, the identical "plain
   * injected function, not a port" DI seam `disableOperator`/`enableOperator`
   * already establish above. */
  readonly listOperators: () => Promise<readonly OperatorDirectoryEntry[]>;
  /** Test seam — production never passes this (`crypto.randomUUID` default). */
  readonly generateOperatorId?: () => string;
  readonly clock?: () => number;
}

function auditWitness(deps: OperatorHandlersDeps, actor: AuthorizedOperator, entry: Omit<AuditEntryInput, "occurredAt" | "actorOperatorId" | "actorUsername">) {
  return async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) =>
    appendAuditEntry(exec, {
      occurredAt: (deps.clock ?? Date.now)(),
      actorOperatorId: actor.id,
      actorUsername: actor.username,
      ...entry,
    });
}

/**
 * Task 11a.1/11a.2: creates a colleague account with a unique username,
 * holding NO permissions (spec Domain K: "a newly created operator holds no
 * permissions by default" — granting is a SEPARATE action, PR15). Refuses a
 * duplicate username/id exactly as `CreateOperatorResult` already
 * discriminates (design §2.3 point 1's continuity, extended to operators by
 * PR9b) — never a 500, since a duplicate is expected form input from an
 * authorized operator, not a server fault.
 */
export function createOperatorCreateHandler(deps: OperatorHandlersDeps): AdminHandler {
  return async (req, actor) => {
    const username = typeof req.body?.username === "string" ? req.body.username : undefined;
    const password = typeof req.body?.password === "string" ? req.body.password : undefined;
    if (username === undefined || username === "" || password === undefined || password === "") {
      return { status: 400, body: JSON.stringify({ error: "missing-fields" }) };
    }

    const id = (deps.generateOperatorId ?? (() => crypto.randomUUID()))() as OperatorId;
    const witness = auditWitness(deps, actor, { action: "operator.created", targetOperatorId: id, changes: { username: { before: null, after: username } } });
    const result = await deps.operators.create({ id, username, passwordHash: hashPassword(password) }, witness);

    if (!result.ok) return { status: 409, body: JSON.stringify({ error: result.reason }) };
    return { status: 201, body: JSON.stringify({ id: result.operator.id, username: result.operator.username }) };
  };
}

function operatorIdParam(req: { readonly params?: Readonly<Record<string, string>> }): OperatorId | undefined {
  const id = req.params?.id;
  return id === undefined || id === "" ? undefined : (id as OperatorId);
}

/**
 * Task 11a.3-11a.5/11a.9: disables the target account, invalidating its live
 * sessions immediately, refused if it would leave zero enabled
 * `operators.manage` holders (design §8, wired via the injected
 * `disableOperator`). `last-account-manager` maps to 409 (a real, expected
 * refusal a form can render — same class as `TenantWriteResult`'s own
 * discriminated refusals), `unknown-operator` to 404.
 */
export function createOperatorDisableHandler(deps: OperatorHandlersDeps): AdminHandler {
  return async (req, actor) => {
    const targetId = operatorIdParam(req);
    if (targetId === undefined) return { status: 400, body: JSON.stringify({ error: "missing-operator-id" }) };

    const witness = auditWitness(deps, actor, { action: "operator.disabled", targetOperatorId: targetId });
    const result = await deps.disableOperator(targetId, witness);

    if (!result.ok) return { status: result.reason === "last-account-manager" ? 409 : 404, body: JSON.stringify({ error: result.reason }) };
    return { status: 200, body: JSON.stringify({ ok: true }) };
  };
}

/**
 * Task 11a.5: re-enables the target account. NEVER routed through the
 * last-account-manager guard (`enableOperator`'s own docstring: enabling can
 * only add a holder back, never remove one).
 */
export function createOperatorEnableHandler(deps: OperatorHandlersDeps): AdminHandler {
  return async (req, actor) => {
    const targetId = operatorIdParam(req);
    if (targetId === undefined) return { status: 400, body: JSON.stringify({ error: "missing-operator-id" }) };

    const witness = auditWitness(deps, actor, { action: "operator.enabled", targetOperatorId: targetId });
    const result = await deps.enableOperator(targetId, witness);

    if (!result.ok) return { status: 404, body: JSON.stringify({ error: result.reason }) };
    return { status: 200, body: JSON.stringify({ ok: true }) };
  };
}

/**
 * Task 16a.1: `GET /operators` — the SAME response both the operator list
 * screen (task 16a.1's own UI half) and the permission matrix (task 16a.6)
 * read from, since the matrix needs exactly the same per-operator
 * permission set the list's own row already carries (design §6.1's own
 * seven-permission taxonomy) — one fetch, not two. A READ, so — unlike
 * every handler above in this file — it builds no `WriteWitness` at all:
 * the identical "no witness for a read" shape `tenant-handlers.ts`'s own
 * `tenantListHandler` already establishes (design §2.3's non-optional
 * witness applies only to `TenantAdminRepository`'s MUTATING methods, and
 * this handler does not even touch that port).
 */
export function createOperatorListHandler(deps: OperatorHandlersDeps): AdminHandler {
  return async () => {
    const operators = await deps.listOperators();
    return { status: 200, body: JSON.stringify({ operators }) };
  };
}
