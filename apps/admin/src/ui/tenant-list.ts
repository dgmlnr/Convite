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
}

/**
 * Pure presentational mapping (task 14.3/14.4) — no fetch, no rendering, no
 * DOM: `TenantListScreen.tsx` (a later PR in this same slice) only ever
 * renders the rows this function already built, so this is where the
 * "each row's status label matches `describeTenantStatus`" property
 * genuinely lives, testable directly without a browser.
 */
export function buildTenantListRows(apiRows: readonly TenantListApiRow[]): readonly TenantListRow[] {
  return apiRows.map((row) => ({ id: row.id, embedKey: row.embedKey, statusLabel: formatTenantStatusLabel(row.status) }));
}
