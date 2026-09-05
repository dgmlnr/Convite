import type { TenantAdminRepository } from "@hexdev/platform-core";
import { describeTenantStatus, instantToPaidThrough, type TenantStatus } from "@hexdev/platform-core";
import type { ThemeOverride } from "@hexdev/widget-protocol";

import type { AdminHandler } from "./authorization.js";

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

export function createTenantDetailHandler(deps: TenantHandlersDeps): AdminHandler {
  return async (req) => {
    const id = req.params?.id;
    if (id === undefined || id === "") return { status: 400, body: JSON.stringify({ error: "missing-tenant-id" }) };

    const tenant = await deps.tenants.findById(id as Parameters<TenantAdminRepository["findById"]>[0]);
    if (tenant === undefined) return { status: 404, body: JSON.stringify({ error: "unknown-tenant" }) };

    const now = (deps.clock ?? Date.now)();
    const row: TenantDetailRow = {
      id: tenant.id,
      embedKey: tenant.embedKey,
      allowedOrigins: tenant.allowedOrigins,
      entitledGames: tenant.entitledGames,
      status: describeTenantStatus(tenant, now),
      validUntilDisplay: tenant.validUntil === undefined ? undefined : instantToPaidThrough(tenant.validUntil),
      theme: tenant.theme,
    };
    return { status: 200, body: JSON.stringify({ tenant: row }) };
  };
}
