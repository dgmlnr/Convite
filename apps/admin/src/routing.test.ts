import { describe, expect, it } from "vitest";

import { resolveAdminRoute } from "./routing.js";

/**
 * `resolveAdminRoute` is pure precisely so the whole route surface — design
 * §6.2's table, the single authorization checkpoint's INPUT — can be pinned
 * without binding a port or wiring a single handler. Every guarded route in
 * this repo (`apps/mint-server/src/routing.ts`, `apps/server`) already keeps
 * its routing decision separate from the `node:http` plumbing for the same
 * reason: a path silently falling through to `not-found` is a quiet failure
 * mode, not a loud one, and this is where it gets caught.
 *
 * `guard` is asserted on EVERY case, not just `kind` — a route resolving to
 * the right `kind` with the wrong `guard` would let `routing.coverage.test.ts`
 * (task 7.7) catch a REGRESSION here, but only if this file itself pins the
 * guard as part of the contract, which is exactly what design §6.3's Layer 1
 * ("`guard` is a required property... a new route constructed without one is
 * a `tsc` error") is a compile-time complement to.
 */
describe("resolveAdminRoute", () => {
  it("serves the login form and its submission, both public and rate-limited elsewhere (slice 8b)", () => {
    expect(resolveAdminRoute("GET", "/login")).toEqual({ kind: "login-form", guard: { access: "public" } });
    expect(resolveAdminRoute("POST", "/login")).toEqual({ kind: "login-submit", guard: { access: "public" } });
  });

  it("serves a static asset, publicly, carrying the file name through", () => {
    expect(resolveAdminRoute("GET", "/assets/app.js")).toEqual({
      kind: "asset",
      guard: { access: "public" },
      params: { file: "app.js" },
    });
  });

  it("refuses an asset path that tries to escape its directory", () => {
    expect(resolveAdminRoute("GET", "/assets/../../../etc/passwd")).toEqual({ kind: "not-found", guard: { access: "public" } });
    expect(resolveAdminRoute("GET", "/assets/..%2Fsecret")).toEqual({ kind: "not-found", guard: { access: "public" } });
    expect(resolveAdminRoute("GET", "/assets/")).toEqual({ kind: "not-found", guard: { access: "public" } });
  });

  it("logs out and changes the operator's own password, both merely authenticated — no specific permission", () => {
    expect(resolveAdminRoute("POST", "/logout")).toEqual({ kind: "logout", guard: { access: "authenticated" } });
    expect(resolveAdminRoute("POST", "/account/password")).toEqual({ kind: "own-password", guard: { access: "authenticated" } });
  });

  /**
   * The read routes reuse `tenant.origins.edit` (design §6.2's asterisked
   * rows) — the taxonomy has no read-only permission (design §19). This is a
   * disclosed vocabulary bend, not an oversight; `permissions.test.ts` pins
   * that the gap is deliberate.
   */
  it("lists and details tenants, gated by the narrowest existing write permission", () => {
    expect(resolveAdminRoute("GET", "/")).toEqual({ kind: "tenant-list", guard: { access: "permission", permission: "tenant.origins.edit" } });
    expect(resolveAdminRoute("GET", "/tenants/acme")).toEqual({
      kind: "tenant-detail",
      guard: { access: "permission", permission: "tenant.origins.edit" },
      params: { id: "acme" },
    });
  });

  it("creates a tenant", () => {
    expect(resolveAdminRoute("POST", "/tenants")).toEqual({ kind: "tenant-create", guard: { access: "permission", permission: "tenant.create" } });
  });

  it("edits a tenant's origins, games, window and theme, each behind its own mapped permission", () => {
    expect(resolveAdminRoute("POST", "/tenants/acme/origins")).toEqual({
      kind: "tenant-origins",
      guard: { access: "permission", permission: "tenant.origins.edit" },
      params: { id: "acme" },
    });
    expect(resolveAdminRoute("POST", "/tenants/acme/games")).toEqual({
      kind: "tenant-games",
      guard: { access: "permission", permission: "tenant.games.edit" },
      params: { id: "acme" },
    });
    expect(resolveAdminRoute("POST", "/tenants/acme/window")).toEqual({
      kind: "tenant-window",
      guard: { access: "permission", permission: "tenant.window.edit" },
      params: { id: "acme" },
    });
    expect(resolveAdminRoute("POST", "/tenants/acme/theme")).toEqual({
      kind: "tenant-theme",
      guard: { access: "permission", permission: "tenant.origins.edit" },
      params: { id: "acme" },
    });
  });

  it("rotates a tenant's embed key", () => {
    expect(resolveAdminRoute("POST", "/tenants/acme/embed-key/rotate")).toEqual({
      kind: "tenant-rotate-key",
      guard: { access: "permission", permission: "tenant.embed-key.rotate" },
      params: { id: "acme" },
    });
  });

  it("manages operator accounts and their permissions, all behind operators.manage", () => {
    expect(resolveAdminRoute("GET", "/operators")).toEqual({ kind: "operator-list", guard: { access: "permission", permission: "operators.manage" } });
    expect(resolveAdminRoute("POST", "/operators")).toEqual({ kind: "operator-create", guard: { access: "permission", permission: "operators.manage" } });
    expect(resolveAdminRoute("POST", "/operators/ana/enable")).toEqual({
      kind: "operator-enable",
      guard: { access: "permission", permission: "operators.manage" },
      params: { id: "ana" },
    });
    expect(resolveAdminRoute("POST", "/operators/ana/disable")).toEqual({
      kind: "operator-disable",
      guard: { access: "permission", permission: "operators.manage" },
      params: { id: "ana" },
    });
    expect(resolveAdminRoute("POST", "/operators/ana/permissions/grant")).toEqual({
      kind: "operator-permissions-grant",
      guard: { access: "permission", permission: "operators.manage" },
      params: { id: "ana" },
    });
    expect(resolveAdminRoute("POST", "/operators/ana/permissions/revoke")).toEqual({
      kind: "operator-permissions-revoke",
      guard: { access: "permission", permission: "operators.manage" },
      params: { id: "ana" },
    });
  });

  it("views the audit log, behind audit.view", () => {
    expect(resolveAdminRoute("GET", "/audit")).toEqual({ kind: "audit-view", guard: { access: "permission", permission: "audit.view" } });
  });

  it("404s anything else, including a wrong method on a real path and an extra path segment", () => {
    expect(resolveAdminRoute("DELETE", "/tenants")).toEqual({ kind: "not-found", guard: { access: "public" } });
    expect(resolveAdminRoute("GET", "/tenants/acme/extra")).toEqual({ kind: "not-found", guard: { access: "public" } });
    expect(resolveAdminRoute("GET", "/nonexistent")).toEqual({ kind: "not-found", guard: { access: "public" } });
  });
});
