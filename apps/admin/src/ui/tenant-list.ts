import type { TenantStatus } from "@hexdev/platform-core";

import { formatTenantStatusLabel } from "./tenant-status.js";

/** The exact shape `tenant-handlers.ts`'s own `TenantListRow` serializes to
 * JSON (`GET /`, task 14.4) — a `status` already DERIVED server-side, never
 * a raw `validFrom`/`validUntil` instant. */
export interface TenantListApiRow {
  readonly id: string;
  readonly embedKey: string;
  readonly status: TenantStatus;
}

export interface TenantListRow {
  readonly id: string;
  readonly embedKey: string;
  readonly statusLabel: string;
  /** Carried alongside `statusLabel` (never derived FROM the label text) so
   * `TenantListScreen.tsx` can color-code a status badge — "who is paid up
   * and who is not, at a glance" (launch prompt §5) needs a visual signal
   * beyond text alone, and re-parsing a Spanish sentence to recover which of
   * the 4 states it names would be exactly the kind of fragile coupling this
   * separate field avoids. */
  readonly statusKind: TenantStatus["kind"];
}

/**
 * Pure presentational mapping (task 14.3/14.4) — no fetch, no rendering, no
 * DOM: `TenantListScreen.tsx` (a later PR in this same slice) only ever
 * renders the rows this function already built, so this is where the
 * "each row's status label matches `describeTenantStatus`" property
 * genuinely lives, testable directly without a browser.
 */
export function buildTenantListRows(apiRows: readonly TenantListApiRow[]): readonly TenantListRow[] {
  return apiRows.map((row) => ({ id: row.id, embedKey: row.embedKey, statusLabel: formatTenantStatusLabel(row.status), statusKind: row.status.kind }));
}
