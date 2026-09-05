import { describe, expect, it } from "vitest";

import { resolveAppShellView } from "./app-shell-routing.js";

/**
 * `resolveAppShellView` (sdd-verify's own finding 1, "el rbac que no llegaba
 * a ningun lado") — extracts `AppShell.tsx`'s own screen-selection decision
 * into a pure function, the same "no React render tests, so pull the DECISION
 * out into something a plain unit test can prove" convention this repo
 * already uses for `tenant-list.ts`/`tenant-detail.ts`/`audit-view.ts`.
 *
 * THE BUG THIS FILE PINS: `AppShell.tsx` used to check
 * `state.kind === "missing-permission" || state.kind === "error"` BEFORE
 * checking `creatingTenant`/`selectedTenantId` — so an operator whose OWN
 * `GET /` (`tenant-list`, guarded `tenant.origins.edit`) came back refused
 * could never reach `TenantCreateScreen`, even after clicking "Crear
 * inquilino", because that button lives inside `TenantListScreen`, which
 * never rendered for them at all. An operator granted ONLY `tenant.create`
 * was parked on the missing-permission screen with no way out.
 *
 * Genuine RED, confirmed before `app-shell-routing.ts` existed: `Cannot find
 * module './app-shell-routing.js'`.
 */
describe("resolveAppShellView", () => {
  it("shows loading while the initial tenant-list probe is in flight", () => {
    expect(resolveAppShellView({ shellState: { kind: "loading" }, screen: "tenants", creatingTenant: false, selectedTenantId: undefined })).toEqual({ kind: "loading" });
  });

  it("shows login when there is no session at all", () => {
    expect(resolveAppShellView({ shellState: { kind: "login" }, screen: "tenants", creatingTenant: false, selectedTenantId: undefined })).toEqual({ kind: "login" });
  });

  it("the top-level nav always wins over any tenant-specific sub-state (operators screen for a `tenant.origins.edit`-less operator)", () => {
    expect(resolveAppShellView({ shellState: { kind: "missing-permission" }, screen: "operators", creatingTenant: false, selectedTenantId: undefined })).toEqual({ kind: "operators" });
  });

  /** sdd-verify's own finding 2: `account` is reachable regardless of the
   * tenant list's own outcome, exactly like `operators`/`audit` — the ONE
   * destination guaranteed to work even for a genuinely zero-permission
   * operator, since `POST /account/password` is guarded `authenticated`
   * only, never `permission`. */
  it("the account screen is reachable the same way, even for an operator whose tenant-list read is refused", () => {
    expect(resolveAppShellView({ shellState: { kind: "missing-permission" }, screen: "account", creatingTenant: false, selectedTenantId: undefined })).toEqual({ kind: "account" });
  });

  it("the top-level nav also wins over an in-progress tenant creation", () => {
    expect(resolveAppShellView({ shellState: { kind: "missing-permission" }, screen: "audit", creatingTenant: true, selectedTenantId: undefined })).toEqual({ kind: "audit" });
  });

  /** THE EXACT REGRESSION CASE: an operator holding only `tenant.create` —
   * `GET /` refused (`missing-permission`), but they clicked "Crear
   * inquilino" from the shell's own always-reachable entry point anyway. */
  it("reaches the create-tenant screen even though the tenant list itself is refused", () => {
    expect(resolveAppShellView({ shellState: { kind: "missing-permission" }, screen: "tenants", creatingTenant: true, selectedTenantId: undefined })).toEqual({ kind: "create-tenant" });
  });

  it("reaches the create-tenant screen the same way when the list failed with a genuine error, not merely a refusal", () => {
    expect(resolveAppShellView({ shellState: { kind: "error" }, screen: "tenants", creatingTenant: true, selectedTenantId: undefined })).toEqual({ kind: "create-tenant" });
  });

  it("reaches a selected tenant's detail screen even though the tenant list itself is refused (the same shape for tenant.games.edit/tenant.window.edit/tenant.embed-key.rotate, once a tenant id is known)", () => {
    expect(resolveAppShellView({ shellState: { kind: "missing-permission" }, screen: "tenants", creatingTenant: false, selectedTenantId: "acme" })).toEqual({ kind: "tenant-detail", tenantId: "acme" });
  });

  it("still shows the honest missing-permission message when neither creating nor viewing a specific tenant", () => {
    expect(resolveAppShellView({ shellState: { kind: "missing-permission" }, screen: "tenants", creatingTenant: false, selectedTenantId: undefined })).toEqual({ kind: "tenant-list-missing-permission" });
  });

  it("still shows the honest generic-error message the same way", () => {
    expect(resolveAppShellView({ shellState: { kind: "error" }, screen: "tenants", creatingTenant: false, selectedTenantId: undefined })).toEqual({ kind: "tenant-list-error" });
  });

  it("shows the loaded tenant list when nothing else applies", () => {
    const rows = [{ id: "acme", embedKey: "pk_live_acme", statusKind: "active" as const, statusLabel: "Activo" }];
    expect(resolveAppShellView({ shellState: { kind: "tenants", rows }, screen: "tenants", creatingTenant: false, selectedTenantId: undefined })).toEqual({ kind: "tenant-list", rows });
  });
});
