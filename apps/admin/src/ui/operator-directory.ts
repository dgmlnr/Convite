import type { OperatorListApiRow } from "./api.js";

export type { OperatorListApiRow };

/**
 * The operator list AND the permission matrix (task 16a.1/16a.6) both
 * render from THIS one view row per operator — the matrix needs exactly the
 * same permission set the list's own row already carries, so there is no
 * second view-model to keep in sync.
 *
 * `isSoleAccountManager` — see this module's own test file for the full
 * argument: a CLIENT-SIDE HINT, computed from THIS SAME response, never a
 * server round trip of its own. It exists so `OperatorsScreen.tsx` can make
 * the last-account-manager constraint (design §8) VISIBLE before an
 * operator attempts to trip it — un-ticking a checkbox or clicking
 * "Deshabilitar" on the row this hint marks true is refused by the REAL
 * server-side guard regardless of what this hint says, because two
 * operators can always race between one fetch and the next write. The hint
 * narrows to enabled holders only: a disabled account can never act as the
 * account manager, so it cannot be the one thing standing between the panel
 * and an unadministerable state, however many stale permission rows it
 * still carries.
 */
export interface OperatorRow {
  readonly id: string;
  readonly username: string;
  readonly enabled: boolean;
  readonly permissions: ReadonlySet<string>;
  readonly isSoleAccountManager: boolean;
}

/**
 * Pure presentational mapping (same shape/purpose as `tenant-detail.ts`'s
 * own `buildTenantDetailView`) — no fetch, no rendering, no DOM.
 */
export function buildOperatorRows(apiRows: readonly OperatorListApiRow[]): readonly OperatorRow[] {
  const enabledManageHolders = apiRows.filter((row) => row.enabled && row.permissions.includes("operators.manage"));
  const soleManagerId = enabledManageHolders.length === 1 ? enabledManageHolders[0]!.id : undefined;
  return apiRows.map((row) => ({
    id: row.id,
    username: row.username,
    enabled: row.enabled,
    permissions: new Set(row.permissions),
    isSoleAccountManager: row.id === soleManagerId,
  }));
}
