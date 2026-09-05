import type { TenantAdminRepository } from "@hexdev/platform-core";
import { describeTenantStatus, type TenantStatus } from "@hexdev/platform-core";

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
