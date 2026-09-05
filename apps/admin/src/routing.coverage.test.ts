import { describe, expect, it } from "vitest";

import { PERMISSIONS, type Permission } from "./permissions.js";
import { ADMIN_ROUTE_TABLE, requiresAuthorizationCheckpoint } from "./routing.js";

/**
 * The table-coverage fence (task 7.7/7.8, design §6.3 Layer 3), modelled on
 * this repo's own two-directional fences —
 * `scripts/ci-suite-coverage.test.ts` and
 * `scripts/dependency-cruiser-layer-coverage.test.ts`. Because
 * `ADMIN_ROUTE_TABLE` is a finite, enumerable pure value, this can assert
 * mechanically what neither `tsc` nor `routing.test.ts`'s call-by-call
 * samples can: that the table AS A WHOLE is internally consistent.
 *
 * Three checks, each catching a distinct failure that types cannot:
 * 1. a mutating route left at `authenticated` (should have been `permission`);
 * 2. a route naming a permission that doesn't exist (a typo, or a permission
 *    invented ahead of `permissions.ts` actually declaring it);
 * 3. a permission nothing ever maps to (grants access to nothing — dead data).
 *
 * DEVIATION FROM DESIGN §6.3'S OWN WORDING, DISCLOSED: that section's prose
 * says "every non-GET route except `login-submit` and `logout`" requires
 * `access: "permission"`. Design §6.2's OWN route table disagrees with its
 * own §6.3 prose: it lists `POST /account/password` (`own-password`) as
 * `access: "authenticated"`, not `"permission"` — and it has to, because spec
 * Domain J's "a routine password change succeeds with the correct current
 * password" scenario names no permission requirement, and a newly created
 * operator "holds no permissions by default" (spec Domain K) yet must still
 * be able to change their own password. Gating `own-password` behind any of
 * the seven permissions would make that scenario unsatisfiable for an
 * operator holding none of them. §6.3's prose is the incomplete artifact
 * here — it simply forgot to also name `own-password` alongside
 * `login-submit`/`logout` — so this fence follows §6.2's route table (the
 * more specific, spec-consistent source) and the corrected three-member
 * exemption set below, not §6.3's two-member prose verbatim.
 */
const AUTHENTICATED_ONLY_KINDS: ReadonlySet<string> = new Set(["login-submit", "logout", "own-password"]);

describe("admin route table coverage (design §6.3, spec Domain K, decisions #3684)", () => {
  it("gates every non-GET route not in the authenticated-only exemption behind a specific permission", () => {
    const violations = ADMIN_ROUTE_TABLE.filter(
      (route) => route.method !== "GET" && !AUTHENTICATED_ONLY_KINDS.has(route.kind) && route.guard.access !== "permission",
    );
    expect(violations).toEqual([]);
  });

  it("never assigns access:\"permission\" to a route this fence deliberately exempts", () => {
    const wronglyPermissioned = ADMIN_ROUTE_TABLE.filter((route) => AUTHENTICATED_ONLY_KINDS.has(route.kind) && route.guard.access === "permission");
    expect(wronglyPermissioned).toEqual([]);
  });

  it("names only permissions that are members of PERMISSIONS — closure, direction one", () => {
    const named = ADMIN_ROUTE_TABLE.filter((route): route is (typeof ADMIN_ROUTE_TABLE)[number] & { guard: { access: "permission"; permission: Permission } } =>
      route.guard.access === "permission",
    ).map((route) => route.guard.permission);
    const unknown = named.filter((permission) => !(PERMISSIONS as readonly string[]).includes(permission));
    expect(unknown).toEqual([]);
  });

  it("every member of PERMISSIONS is named by at least one route — closure, direction two", () => {
    const named = new Set(
      ADMIN_ROUTE_TABLE.filter((route) => route.guard.access === "permission").map((route) => (route.guard as { permission: Permission }).permission),
    );
    const ungrantedAnywhere = PERMISSIONS.filter((permission) => !named.has(permission));
    expect(ungrantedAnywhere).toEqual([]);
  });
});

/**
 * `requiresAuthorizationCheckpoint` (sdd-verify's own finding 4) — closes a
 * hole this fence above could not: `index.ts`'s own dispatcher used to run
 * `authorizeAndDispatch` when `route.guard.access === "permission" ||
 * route.kind === "own-password"`, a condition data-driven for `permission`
 * but hand-listed BY KIND for the entire `authenticated` half of
 * `RouteAccess`. A future route declared `access: "authenticated"` (this
 * fence's own three-member exemption set already permits one, by design)
 * would satisfy every existing check above yet never reach the checkpoint at
 * all — `authorize`'s own session/`enabled` validation would simply never
 * run for it. `logout` is the ONE deliberate exception (PR10d's own
 * idempotent-regardless-of-cookie design, needing no `AuthorizedOperator`);
 * every OTHER `authenticated` route, present or future, is checkpointed
 * automatically.
 *
 * Genuine RED, confirmed before this function existed: `has no exported
 * member 'requiresAuthorizationCheckpoint'`.
 */
describe("requiresAuthorizationCheckpoint (design §6.3 Layers 2-3, sdd-verify finding 4)", () => {
  it("checkpoints every permission-guarded route regardless of kind", () => {
    expect(requiresAuthorizationCheckpoint({ kind: "tenant-list", guard: { access: "permission", permission: "tenant.origins.edit" } })).toBe(true);
  });

  it("does not checkpoint a public route", () => {
    expect(requiresAuthorizationCheckpoint({ kind: "login-form", guard: { access: "public" } })).toBe(false);
  });

  it("still exempts exactly logout from the authenticated checkpoint (PR10d's own idempotent-regardless-of-cookie design)", () => {
    expect(requiresAuthorizationCheckpoint({ kind: "logout", guard: { access: "authenticated" } })).toBe(false);
  });

  it("still checkpoints own-password (design §6.2's own authenticated exemption for a zero-permission operator)", () => {
    expect(requiresAuthorizationCheckpoint({ kind: "own-password", guard: { access: "authenticated" } })).toBe(true);
  });

  /** THE EXACT REGRESSION CASE the finding names: a hypothetical FUTURE
   * route, any kind other than `logout`, guarded `authenticated` — never
   * hand-listed by kind, checkpointed purely because its guard says so. */
  it("checkpoints a hypothetical future authenticated route other than logout, with no kind-by-kind list to keep in sync", () => {
    expect(requiresAuthorizationCheckpoint({ kind: "asset", guard: { access: "authenticated" } })).toBe(true);
  });

  it("every route actually in ADMIN_ROUTE_TABLE agrees with the fixed check order (permission wins, then authenticated-except-logout, else public)", () => {
    for (const route of ADMIN_ROUTE_TABLE) {
      const expected = route.guard.access === "permission" || (route.guard.access === "authenticated" && route.kind !== "logout");
      expect(requiresAuthorizationCheckpoint(route)).toBe(expected);
    }
  });
});
