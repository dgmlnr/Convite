import type { AppScreen } from "./AppNav.js";
import type { TenantListRow } from "./tenant-list.js";

/**
 * `AppShell.tsx`'s own screen-selection state, extracted so the DECISION —
 * not merely the rendering — is a pure function a plain unit test can prove
 * (the same "no React render tests, so pull the decision out" convention
 * `tenant-list.ts`/`tenant-detail.ts`/`audit-view.ts` already establish).
 */
export type ShellProbeState =
  | { readonly kind: "loading" }
  | { readonly kind: "login" }
  | { readonly kind: "missing-permission" }
  | { readonly kind: "error" }
  | { readonly kind: "tenants"; readonly rows: readonly TenantListRow[] };

export interface ResolveAppShellViewInput {
  readonly shellState: ShellProbeState;
  readonly screen: AppScreen;
  readonly creatingTenant: boolean;
  readonly selectedTenantId: string | undefined;
}

export type AppShellView =
  | { readonly kind: "loading" }
  | { readonly kind: "login" }
  | { readonly kind: "operators" }
  | { readonly kind: "audit" }
  | { readonly kind: "account" }
  | { readonly kind: "create-tenant" }
  | { readonly kind: "tenant-detail"; readonly tenantId: string }
  | { readonly kind: "tenant-list-missing-permission" }
  | { readonly kind: "tenant-list-error" }
  | { readonly kind: "tenant-list"; readonly rows: readonly TenantListRow[] };

/**
 * sdd-verify's finding 1 ("el rbac que no llegaba a ningun lado"), closed
 * here: `creatingTenant`/`selectedTenantId` now resolve BEFORE the tenant
 * list's own `missing-permission`/`error` state — an operator holding only
 * `tenant.create` (whose `GET /` is refused, since that read reuses
 * `tenant.origins.edit`, design §19's disclosed vocabulary bend) can still
 * reach `TenantCreateScreen`; the same holds for `selectedTenantId`, so a
 * known tenant id reaches `TenantDetailScreen` regardless of the LIST read's
 * own outcome — the exact shape `tenant.games.edit`/`tenant.window.edit`/
 * `tenant.embed-key.rotate` need once a tenant id is in hand.
 *
 * CLIENT-SIDE GATING IS STILL UX ONLY: this function decides which SCREEN
 * renders, never whether a request succeeds — `TenantCreateScreen`'s own
 * `POST /tenants` and `TenantDetailScreen`'s own `GET /tenants/:id` still run
 * through the single authorization checkpoint exactly as before, and a
 * genuine 403 is still handled gracefully by each of those screens' own
 * `missing-permission` state (already in place, unchanged by this fix).
 *
 * The top-level nav (`operators`/`audit`/`account`) still wins over any
 * tenant-specific sub-state, unchanged from `AppShell.tsx`'s own prior
 * ordering: each destination owns its own independent fetch (or, for
 * `account`, no permission check at all — sdd-verify finding 2) so there is
 * never a reason to prefer a stale tenant-list probe over an operator's own
 * explicit navigation choice.
 */
export function resolveAppShellView(input: ResolveAppShellViewInput): AppShellView {
  const { shellState, screen, creatingTenant, selectedTenantId } = input;

  if (shellState.kind === "loading") return { kind: "loading" };
  if (shellState.kind === "login") return { kind: "login" };

  if (screen === "operators") return { kind: "operators" };
  if (screen === "audit") return { kind: "audit" };
  if (screen === "account") return { kind: "account" };

  if (creatingTenant) return { kind: "create-tenant" };
  if (selectedTenantId !== undefined) return { kind: "tenant-detail", tenantId: selectedTenantId };

  if (shellState.kind === "missing-permission") return { kind: "tenant-list-missing-permission" };
  if (shellState.kind === "error") return { kind: "tenant-list-error" };

  return { kind: "tenant-list", rows: shellState.rows };
}
