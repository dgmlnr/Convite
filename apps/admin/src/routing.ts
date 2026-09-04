import type { Permission } from "./permissions.js";

/**
 * The admin panel's route table (design §6.2, spec Domain K) — the input to
 * the SINGLE authorization checkpoint (`authorization.ts`, slice 9). Kept
 * pure and separate from `node:http`, the same discipline
 * `apps/mint-server/src/routing.ts` already established: the routing
 * DECISION is what silently breaks (a route quietly falling through to
 * `not-found`, or worse, resolving with the wrong guard), so it lives here,
 * testable without binding a port or wiring a single handler.
 *
 * `guard` is a REQUIRED field on `AdminRoute` (design §6.3 Layer 1) — not
 * optional, not defaulted. A route literal that omits it is a `tsc` error,
 * which is what makes "forgetting the checkpoint" a compile-time
 * impossibility rather than a runtime state a test has to go looking for.
 */
export type RouteAccess =
  | { readonly access: "public" }
  | { readonly access: "authenticated" }
  | { readonly access: "permission"; readonly permission: Permission };

export type AdminRouteKind =
  | "login-form"
  | "login-submit"
  | "asset"
  | "logout"
  | "own-password"
  | "tenant-list"
  | "tenant-detail"
  | "tenant-create"
  | "tenant-origins"
  | "tenant-games"
  | "tenant-window"
  | "tenant-theme"
  | "tenant-rotate-key"
  | "operator-list"
  | "operator-create"
  | "operator-enable"
  | "operator-disable"
  | "operator-permissions-grant"
  | "operator-permissions-revoke"
  | "audit-view"
  | "not-found";

export interface AdminRoute {
  readonly kind: AdminRouteKind;
  readonly guard: RouteAccess;
  readonly params?: Readonly<Record<string, string>>;
}

const PUBLIC: RouteAccess = { access: "public" };
const AUTHENTICATED: RouteAccess = { access: "authenticated" };
function permission(name: Permission): RouteAccess {
  return { access: "permission", permission: name };
}

/**
 * One entry per real route, `path` written with `:name` for a captured
 * segment — the same segment count on both sides is what `matchSegments`
 * below relies on, so `/tenants/:id/origins` never accidentally matches
 * `/tenants/acme` (fewer segments) or `/tenants/acme/origins/extra` (more).
 *
 * Exported (not merely consumed internally by `resolveAdminRoute`) because
 * the route table is a finite, enumerable pure VALUE — design §6.3's Layer 3
 * argument for why `routing.coverage.test.ts` can assert closure
 * mechanically at all. A test iterating call-by-call resolutions could only
 * ever sample the table; this lets it read the whole thing.
 */
export interface AdminRouteDefinition {
  readonly method: string;
  readonly path: string;
  readonly kind: AdminRouteKind;
  readonly guard: RouteAccess;
}

export const ADMIN_ROUTE_TABLE: readonly AdminRouteDefinition[] = [
  { method: "GET", path: "/login", kind: "login-form", guard: PUBLIC },
  { method: "POST", path: "/login", kind: "login-submit", guard: PUBLIC },
  { method: "POST", path: "/logout", kind: "logout", guard: AUTHENTICATED },
  { method: "POST", path: "/account/password", kind: "own-password", guard: AUTHENTICATED },
  // The taxonomy has no read-only permission (design §19, permissions.test.ts) —
  // both read routes reuse the narrowest existing write permission, a
  // disclosed vocabulary bend rather than an invented eighth permission.
  { method: "GET", path: "/", kind: "tenant-list", guard: permission("tenant.origins.edit") },
  { method: "GET", path: "/tenants/:id", kind: "tenant-detail", guard: permission("tenant.origins.edit") },
  { method: "POST", path: "/tenants", kind: "tenant-create", guard: permission("tenant.create") },
  { method: "POST", path: "/tenants/:id/origins", kind: "tenant-origins", guard: permission("tenant.origins.edit") },
  { method: "POST", path: "/tenants/:id/games", kind: "tenant-games", guard: permission("tenant.games.edit") },
  { method: "POST", path: "/tenants/:id/window", kind: "tenant-window", guard: permission("tenant.window.edit") },
  { method: "POST", path: "/tenants/:id/theme", kind: "tenant-theme", guard: permission("tenant.origins.edit") },
  { method: "POST", path: "/tenants/:id/embed-key/rotate", kind: "tenant-rotate-key", guard: permission("tenant.embed-key.rotate") },
  { method: "GET", path: "/operators", kind: "operator-list", guard: permission("operators.manage") },
  { method: "POST", path: "/operators", kind: "operator-create", guard: permission("operators.manage") },
  { method: "POST", path: "/operators/:id/enable", kind: "operator-enable", guard: permission("operators.manage") },
  { method: "POST", path: "/operators/:id/disable", kind: "operator-disable", guard: permission("operators.manage") },
  { method: "POST", path: "/operators/:id/permissions/grant", kind: "operator-permissions-grant", guard: permission("operators.manage") },
  { method: "POST", path: "/operators/:id/permissions/revoke", kind: "operator-permissions-revoke", guard: permission("operators.manage") },
  { method: "GET", path: "/audit", kind: "audit-view", guard: permission("audit.view") },
];

const ASSET_PREFIX = "/assets/";
const NOT_FOUND: AdminRoute = { kind: "not-found", guard: PUBLIC };

function segmentsOf(pathname: string): readonly string[] {
  return pathname.split("/").filter((segment) => segment.length > 0);
}

/**
 * Whether `pattern`'s segments match `actual`'s, capturing every `:name`
 * segment along the way. `undefined` return means "no match at all" (not
 * "matched with zero params"), so a caller can distinguish the two without a
 * second call — mirrors `apps/mint-server/src/routing.ts`'s own
 * `assetFileName` returning `undefined` for "no file", never an empty string.
 */
function matchSegments(pattern: readonly string[], actual: readonly string[]): Readonly<Record<string, string>> | undefined {
  if (pattern.length !== actual.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i += 1) {
    const patternSegment = pattern[i]!;
    const actualSegment = actual[i]!;
    if (patternSegment.startsWith(":")) {
      if (actualSegment === "") return undefined;
      params[patternSegment.slice(1)] = decodeURIComponent(actualSegment);
    } else if (patternSegment !== actualSegment) {
      return undefined;
    }
  }
  return params;
}

/**
 * The file name an `/assets/` request carries, or `undefined` when the rest
 * of the path is not a bare name. Rejected HERE rather than left to whatever
 * later slice serves the bytes — the same argument
 * `apps/mint-server/src/routing.ts`'s `assetFileName` already makes: a route
 * that cannot express a traversal is a stronger guarantee than a reader that
 * has to remember to check for one. `%2F` is checked alongside `/` because a
 * caller may hand this function a raw, undecoded pathname.
 */
function assetFileName(pathname: string): string | undefined {
  const file = pathname.slice(ASSET_PREFIX.length);
  if (file === "" || file.includes("/") || file.includes("\\") || file.includes("..") || /%2f/i.test(file)) {
    return undefined;
  }
  return file;
}

export function resolveAdminRoute(method: string, pathname: string): AdminRoute {
  if (method === "GET" && pathname.startsWith(ASSET_PREFIX)) {
    const file = assetFileName(pathname);
    return file === undefined ? NOT_FOUND : { kind: "asset", guard: PUBLIC, params: { file } };
  }

  const actual = segmentsOf(pathname);
  for (const route of ADMIN_ROUTE_TABLE) {
    if (route.method !== method) continue;
    const params = matchSegments(segmentsOf(route.path), actual);
    if (params === undefined) continue;
    return Object.keys(params).length > 0 ? { kind: route.kind, guard: route.guard, params } : { kind: route.kind, guard: route.guard };
  }
  return NOT_FOUND;
}
