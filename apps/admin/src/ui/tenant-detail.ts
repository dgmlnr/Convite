import type { TenantStatus } from "@hexdev/platform-core";

/** The exact shape `tenant-handlers.ts`'s own `TenantDetailRow` serializes to
 * JSON (`GET /tenants/:id`) — origins/games arrive as the tenant's REAL
 * current lists (which MAY be empty — design §1.3/decisions #3684, "created,
 * no origin configured yet" is a legitimate state, never forced non-empty
 * here or anywhere downstream of this type), and `validUntilDisplay` is the
 * CURRENT paid-through date whenever a window's upper bound is set at all,
 * independent of `status.kind` (see `tenant-handlers.ts`'s own docstring on
 * why this cannot be recovered from `status` alone).
 *
 * Declared here (not inline in `api.ts`) even before this module grows any
 * pure mapping function of its own — mirrors `tenant-list.ts`'s own
 * established convention, where the API-row TYPE and its later
 * presentational mapping share one module, so a follow-up PR extending this
 * file with `buildTenantDetailView` (the pure view-model mapping this type
 * feeds) never has to relocate this declaration.
 */
export interface TenantDetailApiRow {
  readonly id: string;
  readonly embedKey: string;
  readonly allowedOrigins: readonly string[];
  readonly entitledGames: readonly string[];
  readonly status: TenantStatus;
  readonly validUntilDisplay?: string;
}
