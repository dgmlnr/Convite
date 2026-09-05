import { AUDIT_ACTIONS, type AuditAction } from "./audit-log.js";
import type { AdminHandler } from "./authorization.js";
import type { AuditEntryRow, AuditQueryFilters } from "./audit-query.js";

/**
 * `GET /audit` (spec Domain L, design §6.2/§9/§10, tasks 16b.2/16b.3/16b.4) —
 * already guarded by `audit.view` since design §6.2's own route table (task
 * 7.7), stubbed 501 until now. A READ, so — like `tenant-handlers.ts`'s own
 * `tenantListHandler` — it builds no `WriteWitness` at all.
 *
 * `isAuditAction` IS THE CLOSED-VOCABULARY FENCE (the identical placement
 * `permission-handlers.ts`'s own `isPermission` establishes for a different
 * closed vocabulary, spec Domain L's own boundary): `audit-query.ts` never
 * learns `AUDIT_ACTIONS` (its own docstring), so THIS module is the ONLY
 * place an incoming `?action=` query-string value is checked against it. An
 * unrecognised value is silently IGNORED (the filter simply does not apply)
 * rather than refused with a 400 — a `GET` with an unknown filter value is
 * not a malformed request, it is a filter matching nothing meaningfully
 * different from "no filter", and the launch prompt's own boundary demand
 * (never let the viewer's own vocabulary imply an event class that does not
 * exist) is satisfied structurally: even a HOSTILE `?action=tenant.refused`
 * value can never reach `listAuditEntries`'s own `action` parameter, because
 * it is not a member of the sixteen real, closed `AUDIT_ACTIONS`.
 */
export interface AuditHandlersDeps {
  readonly listAuditEntries: (filters: AuditQueryFilters) => Promise<readonly AuditEntryRow[]>;
}

function isAuditAction(value: string | undefined): value is AuditAction {
  return value !== undefined && (AUDIT_ACTIONS as readonly string[]).includes(value);
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

/** `Date.parse` returns `NaN` for anything unparseable — `NaN` is a real
 * `number`, so a caller comparing epoch-ms directly would silently accept
 * it as a valid (nonsensical) bound. Filtered out here rather than left for
 * `listAuditEntries`/Postgres to reject less legibly. */
function parseDateParam(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function createAuditViewHandler(deps: AuditHandlersDeps): AdminHandler {
  return async (req) => {
    const query = req.query ?? {};
    const filters: AuditQueryFilters = {
      actorUsername: nonEmpty(query.actor),
      targetTenantId: nonEmpty(query.tenant),
      action: isAuditAction(query.action) ? query.action : undefined,
      occurredFrom: parseDateParam(query.from),
      occurredTo: parseDateParam(query.to),
    };
    const entries = await deps.listAuditEntries(filters);
    return { status: 200, body: JSON.stringify({ entries }) };
  };
}
