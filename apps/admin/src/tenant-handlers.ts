import type { TenantAdminRepository, TenantId, TenantRecord } from "@hexdev/platform-core";
import { describeTenantStatus, instantToPaidThrough, type TenantStatus } from "@hexdev/platform-core";
import type { ThemeOverride } from "@hexdev/widget-protocol";

import type { AdminHandler, AuthorizedOperator } from "./authorization.js";
import { appendAuditEntry, type AuditEntryInput } from "./audit-log.js";

/**
 * `GET /` (task 14.4, design §6.2's own `tenant-list` route — permission
 * `tenant.origins.edit`, the taxonomy's own reused read-route bend, design
 * §19). The FIRST real handler for a route this app's authorization
 * checkpoint has guarded since slice 9 (PR11) but that stubbed 501 ever
 * since — no mock server, no fixture backend (launch prompt §1): `deps.tenants`
 * is a REAL `TenantAdminRepository`, bound to this process's own Postgres
 * pool in `index.ts`, the identical adapter `operator-handlers.ts`'s own
 * repositories already are.
 *
 * STATUS IS COMPUTED HERE, SERVER-SIDE, ONCE (design §1.9, decision #3684
 * item 4) — never persisted, never re-derived client-side from raw
 * `validFrom`/`validUntil`. `apps/admin/src/ui/tenant-status.ts` only maps
 * the closed `TenantStatus` this handler already computed onto a Spanish
 * label; it never re-implements `describeTenantStatus`'s own comparison.
 */
export interface TenantHandlersDeps {
  readonly tenants: TenantAdminRepository;
  /** Defaults to `Date.now` — the same `Clock`-injection discipline every
   * other choke point in this codebase already establishes, so a test can
   * "travel in time" without faking global timers. */
  readonly clock?: () => number;
}

export interface TenantListRow {
  readonly id: string;
  readonly embedKey: string;
  readonly status: TenantStatus;
}

export function createTenantListHandler(deps: TenantHandlersDeps): AdminHandler {
  return async () => {
    const tenants = await deps.tenants.list();
    const now = (deps.clock ?? Date.now)();
    const rows: readonly TenantListRow[] = tenants.map((tenant) => ({
      id: tenant.id,
      embedKey: tenant.embedKey,
      status: describeTenantStatus(tenant, now),
    }));
    return { status: 200, body: JSON.stringify({ tenants: rows }) };
  };
}

/**
 * `GET /tenants/:id` (slice 15's own necessary, disclosed prerequisite —
 * not itemized as its own numbered task in Phase 15a, same class of
 * plumbing PR4e's "remediation, not itemized originally" already
 * established for this chain: an origin/game/window editor needs a screen
 * to load, and that screen needs ONE tenant's FULL record, never the
 * list's trimmed `id`/`embedKey`/`status` triple).
 */
export interface TenantDetailRow {
  readonly id: string;
  readonly embedKey: string;
  readonly allowedOrigins: readonly string[];
  readonly entitledGames: readonly string[];
  readonly status: TenantStatus;
  /**
   * ISO `"YYYY-MM-DD"` — the "paid through" calendar date `instantToPaidThrough`
   * (design §2.4/decisions #3684 item 1, task 15a.5) derives from `validUntil`,
   * present whenever a window's upper bound is set AT ALL, regardless of
   * `status.kind`. `TenantStatus`'s own `active` branch deliberately carries
   * no date (design §1.9: the panel answers "why isn't it working", nothing
   * more) — but the window EDITOR still needs the CURRENT paid-through date
   * to pre-fill even for an already-active tenant, so this field is derived
   * here, separately from `status`, never by re-deriving `status` itself.
   */
  readonly validUntilDisplay?: string;
  readonly theme?: ThemeOverride;
}

/** Shared by every handler in this file that returns a tenant to the browser
 * (detail, and every write handler below on success) — ONE place computing
 * `status`/`validUntilDisplay` from a real `TenantRecord`, so a future write
 * handler cannot accidentally ship a differently-shaped row than the read
 * handler already established. */
function buildTenantDetailRow(tenant: TenantRecord, now: number): TenantDetailRow {
  return {
    id: tenant.id,
    embedKey: tenant.embedKey,
    allowedOrigins: tenant.allowedOrigins,
    entitledGames: tenant.entitledGames,
    status: describeTenantStatus(tenant, now),
    validUntilDisplay: tenant.validUntil === undefined ? undefined : instantToPaidThrough(tenant.validUntil),
    theme: tenant.theme,
  };
}

export function createTenantDetailHandler(deps: TenantHandlersDeps): AdminHandler {
  return async (req) => {
    const id = req.params?.id;
    if (id === undefined || id === "") return { status: 400, body: JSON.stringify({ error: "missing-tenant-id" }) };

    const tenant = await deps.tenants.findById(id as TenantId);
    if (tenant === undefined) return { status: 404, body: JSON.stringify({ error: "unknown-tenant" }) };

    return { status: 200, body: JSON.stringify({ tenant: buildTenantDetailRow(tenant, (deps.clock ?? Date.now)()) }) };
  };
}

type ExecFn = (sql: string, values: readonly unknown[]) => Promise<void>;

/** Same shape `operator-handlers.ts`'s own `auditWitness`/`permission-handlers.ts`'s
 * own `permissionAuditWitness` already establish — a `WriteWitness` closure
 * that inserts exactly one audit entry, carrying the REAL authorized actor
 * (never a hardcoded id/username) and this call's own `AuditAction`. */
function tenantAuditWitness(deps: TenantHandlersDeps, actor: AuthorizedOperator, entry: Omit<AuditEntryInput, "occurredAt" | "actorOperatorId" | "actorUsername">) {
  return async (exec: ExecFn) =>
    appendAuditEntry(exec, {
      occurredAt: (deps.clock ?? Date.now)(),
      actorOperatorId: actor.id,
      actorUsername: actor.username,
      ...entry,
    });
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/**
 * `POST /tenants/:id/origins` (tasks 15a.1/15a.2, permission
 * `tenant.origins.edit`) — the FIRST real write this app has ever performed
 * against `TenantAdminRepository` from a route (design §2.3's write port,
 * built in slice 4, unconsumed by any handler until now). An empty
 * `origins` array is accepted, never refused (design §1.3/decisions #3684:
 * "created, no origin configured yet" is legitimate, carried forward from
 * `tenant-record-shape.ts`'s own retired docstring).
 *
 * Reads the tenant BEFORE writing (one extra lookup, negligible at this
 * panel's single-digit-operator scale) so the audit entry's `changes` field
 * carries the REAL prior value, not a placeholder — design §9's own
 * before/after requirement, taken literally rather than nominally satisfied.
 */
export function createTenantOriginsHandler(deps: TenantHandlersDeps): AdminHandler {
  return async (req, actor) => {
    const id = req.params?.id;
    if (id === undefined || id === "") return { status: 400, body: JSON.stringify({ error: "missing-tenant-id" }) };
    const origins = req.body?.origins;
    if (!isStringArray(origins)) return { status: 400, body: JSON.stringify({ error: "invalid-origins" }) };

    const existing = await deps.tenants.findById(id as TenantId);
    const witness = tenantAuditWitness(deps, actor, {
      action: "tenant.origins.updated",
      targetTenantId: id as TenantId,
      changes: { allowedOrigins: { before: existing?.allowedOrigins ?? null, after: origins } },
    });
    const result = await deps.tenants.updateAllowedOrigins(id as TenantId, origins, witness);
    if (!result.ok) return { status: result.reason === "unknown-tenant" ? 404 : 400, body: JSON.stringify({ error: result.reason }) };
    return { status: 200, body: JSON.stringify({ tenant: buildTenantDetailRow(result.tenant, (deps.clock ?? Date.now)()) }) };
  };
}

/**
 * `POST /tenants/:id/games` (tasks 15a.3/15a.4, permission
 * `tenant.games.edit`) — structurally identical to the origins handler
 * above, same "empty is legitimate" rule (an entitlement lapsing to zero is
 * a real state this panel must be able to reach and show, not a validation
 * error).
 */
export function createTenantGamesHandler(deps: TenantHandlersDeps): AdminHandler {
  return async (req, actor) => {
    const id = req.params?.id;
    if (id === undefined || id === "") return { status: 400, body: JSON.stringify({ error: "missing-tenant-id" }) };
    const games = req.body?.games;
    if (!isStringArray(games)) return { status: 400, body: JSON.stringify({ error: "invalid-games" }) };

    const existing = await deps.tenants.findById(id as TenantId);
    const witness = tenantAuditWitness(deps, actor, {
      action: "tenant.games.updated",
      targetTenantId: id as TenantId,
      changes: { entitledGames: { before: existing?.entitledGames ?? null, after: games } },
    });
    const result = await deps.tenants.updateEntitledGames(id as TenantId, games, witness);
    if (!result.ok) return { status: result.reason === "unknown-tenant" ? 404 : 400, body: JSON.stringify({ error: result.reason }) };
    return { status: 200, body: JSON.stringify({ tenant: buildTenantDetailRow(result.tenant, (deps.clock ?? Date.now)()) }) };
  };
}

