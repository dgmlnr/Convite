import type { OperatorRepository } from "@hexdev/platform-core";
import type { AdminHandler } from "./authorization.js";
import { appendAuditEntry } from "./audit-log.js";
import { hashPassword, verifyPassword, type PasswordComparator } from "./operator-password.js";

/**
 * `POST /account/password` (spec Domain J, design §6.2, task 11a.10-11a.11)
 * — routine self-service password change, guarded `authenticated` only
 * (design §6.2's own table, task 7.7's disclosed three-member exemption:
 * a permission gate on this route is unsatisfiable for a zero-permission
 * operator). Reached through `index.ts`'s checkpoint the same way every
 * `permission`-guarded route is (task 9's own deferred scope, closed here):
 * `authorize` still validates session + `enabled`, simply never reaches the
 * `guard.access === "permission"` branch for this route's `RouteAccess`.
 *
 * Requires the CORRECT current password before accepting a new one — unlike
 * `operator-handlers.ts`'s `create`/`disable`/`enable` (all gated by
 * `operators.manage`, a DIFFERENT operator acting on someone else's
 * account), this route always acts on the CALLER'S OWN record
 * (`actor.id`), so no `:id` route parameter exists to trust or distrust.
 */
export interface OwnPasswordHandlerDeps {
  readonly operators: OperatorRepository;
  readonly clock?: () => number;
  /** Test seam, identical shape to `operator-password.ts`'s own
   * `PasswordComparator` — production never passes this. */
  readonly compare?: PasswordComparator;
}

export function createOwnPasswordHandler(deps: OwnPasswordHandlerDeps): AdminHandler {
  return async (req, actor) => {
    const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : undefined;
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : undefined;
    if (currentPassword === undefined || currentPassword === "" || newPassword === undefined || newPassword === "") {
      return { status: 400, body: JSON.stringify({ error: "missing-fields" }) };
    }

    // `authorize` already confirmed this session belongs to an enabled
    // operator, but never handed back a password hash (`AuthorizedOperator`
    // deliberately carries no credential material) — this is the one real
    // lookup this handler needs, by id, never by a caller-supplied username.
    const operator = await deps.operators.findById(actor.id);
    if (operator === undefined) return { status: 404, body: JSON.stringify({ error: "unknown-operator" }) };

    const compare = deps.compare ?? verifyPassword;
    if (!compare(currentPassword, operator.passwordHash)) {
      return { status: 401, body: JSON.stringify({ error: "invalid-current-password" }) };
    }

    const witness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) =>
      appendAuditEntry(exec, {
        occurredAt: (deps.clock ?? Date.now)(),
        actorOperatorId: actor.id,
        actorUsername: actor.username,
        action: "operator.password.changed",
        targetOperatorId: actor.id,
      });
    const result = await deps.operators.updatePassword(actor.id, hashPassword(newPassword), witness);

    if (!result.ok) return { status: 404, body: JSON.stringify({ error: result.reason }) };
    return { status: 200, body: JSON.stringify({ ok: true }) };
  };
}
