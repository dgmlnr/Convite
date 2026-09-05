/**
 * The panel's own thin `fetch` client — the browser-side counterpart to
 * `login-handler.ts`/`logout-handler.ts`/`tenant-handlers.ts`'s own
 * framework-agnostic cores. Every call is same-origin and cookie-bearing
 * (`credentials: "include"`) ON PURPOSE: the session cookie is
 * `SameSite=Strict` (`session-cookie.ts`), which a cross-origin request
 * cannot carry at all, and `csrf.ts`'s own `isSameOriginRequest` refuses a
 * foreign `Origin`/`Referer` outright — so this app's own SPA is served
 * FROM the same admin process it talks to (`GET /login`/`GET /assets/*`,
 * wired in a later PR of this slice), never from a separate dev-server
 * origin proxying across. There is deliberately no base-URL configuration
 * knob here: a same-origin relative path (`/login`, `/`, `/logout`) is the
 * whole point, not an oversight.
 *
 * REAL ROUTES ONLY (launch prompt §1): every function below targets a route
 * that already exists in `routing.ts`'s `ADMIN_ROUTE_TABLE` and already has
 * a real handler wired in `index.ts` by the PR that adds it — never a mock
 * server, never a fixture backend.
 */

import type { ThemeContrastViolation, ThemeOverride } from "@hexdev/widget-protocol";

import type { Permission } from "../permissions.js";
import type { TenantDetailApiRow } from "./tenant-detail.js";
import type { TenantListApiRow } from "./tenant-list.js";

/**
 * `GET /operators`'s own wire row (task 16a.1) — the exact shape
 * `apps/admin/src/operator-handlers.ts`'s own `createOperatorListHandler`
 * serializes to JSON. Owned HERE rather than in a view-model file (unlike
 * `TenantListApiRow`/`TenantDetailApiRow` above, both owned by their own
 * view-model module): this client function ships before the operator/
 * permission-matrix screen's own view-model does, in this chain's own
 * natural PR split, and a wire-format type belongs with the transport layer
 * when no view-model file exists yet to own it. A LATER view-model
 * (`operator-directory.ts`) imports this type FROM here instead.
 */
export interface OperatorListApiRow {
  readonly id: string;
  readonly username: string;
  readonly enabled: boolean;
  readonly permissions: readonly string[];
}

export type LoginOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "invalid-credentials" | "rate-limited" | "network-error" };

/**
 * `POST /login` (design §11.2, slice 8b — already shipped; this is its
 * FIRST browser-side caller). Maps every server response this route can
 * produce (`login-handler.ts`'s own return shapes: 200/401/429/400) onto one
 * closed `LoginOutcome`, so `LoginScreen.tsx` never has to parse a status
 * code itself. `400` (missing credentials) is folded into
 * `"invalid-credentials"` deliberately: the form already refuses to submit
 * empty fields client-side (UX only, launch prompt §3 — the SERVER'S OWN
 * 400 is the real enforcement this folds back to on a submission that
 * somehow bypassed that check), so a caller never needs a fourth reason to
 * render a fourth string for a case the form already prevents.
 */
export async function postLogin(username: string, password: string): Promise<LoginOutcome> {
  let response: Response;
  try {
    response = await fetch("/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (response.status === 200) return { ok: true };
  if (response.status === 429) return { ok: false, reason: "rate-limited" };
  return { ok: false, reason: "invalid-credentials" };
}

export type TenantListOutcome =
  | { readonly ok: true; readonly tenants: readonly TenantListApiRow[] }
  | { readonly ok: false; readonly reason: "no-session" | "missing-permission" | "network-error" };

/**
 * `GET /` (task 14.4 — the SAME route the SPA itself is served from at
 * `GET /login`, never this one; see this module's own header). The single
 * authorization checkpoint (`authorization.ts`) doubles as this app's own
 * session probe: `AppShell` (a later PR in this same slice) has no separate
 * "am I logged in" route to call, because `authorize`'s own two failure
 * shapes already say so — 401 (`no-session`/`session-expired`/
 * `account-disabled`, `authorization.ts`'s own docstring) means "show the
 * login screen", 403 (`missing-permission`) means "logged in, but this
 * account cannot see tenants" (launch prompt §3: the UI reflects what the
 * server will actually do, never hides it). Collapsing every 401 cause into
 * one `"no-session"` reason mirrors `postLogin`'s own "one message, three
 * causes" choice above, for the identical reason: none of the three is this
 * screen's to distinguish.
 */
export async function getTenants(): Promise<TenantListOutcome> {
  let response: Response;
  try {
    response = await fetch("/", { headers: { accept: "application/json" }, credentials: "include" });
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (response.status === 403) return { ok: false, reason: "missing-permission" };
  if (response.status !== 200) return { ok: false, reason: "no-session" };
  const body = (await response.json()) as { readonly tenants: readonly TenantListApiRow[] };
  return { ok: true, tenants: body.tenants };
}

export type TenantDetailOutcome =
  | { readonly ok: true; readonly tenant: TenantDetailApiRow }
  | { readonly ok: false; readonly reason: "no-session" | "missing-permission" | "unknown-tenant" | "network-error" };

/**
 * `GET /tenants/:id` (slice 15's own necessary prerequisite —
 * `tenant-handlers.ts`'s own docstring on why this handler exists at all).
 * Same three-way session/permission/network mapping `getTenants` already
 * establishes, PLUS a fourth reason this route alone can produce:
 * `unknown-tenant` (404) — a tenant id that never existed, or one deleted
 * out from under an already-open detail screen. Collapsed into its own
 * named reason rather than folded into `network-error`, because the two
 * demand different UI: one is "this record is gone", the other is "try
 * again".
 */
export async function getTenantDetail(id: string): Promise<TenantDetailOutcome> {
  let response: Response;
  try {
    response = await fetch(`/tenants/${encodeURIComponent(id)}`, { headers: { accept: "application/json" }, credentials: "include" });
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (response.status === 403) return { ok: false, reason: "missing-permission" };
  if (response.status === 404) return { ok: false, reason: "unknown-tenant" };
  if (response.status !== 200) return { ok: false, reason: "no-session" };
  const body = (await response.json()) as { readonly tenant: TenantDetailApiRow };
  return { ok: true, tenant: body.tenant };
}

export type TenantCreateOutcome =
  | { readonly ok: true; readonly tenant: TenantDetailApiRow }
  | { readonly ok: false; readonly reason: "no-session" | "missing-permission" | "tenant-id-taken" | "embed-key-taken" | "invalid-payload" | "network-error" };

/**
 * `POST /tenants` (permission `tenant.create`, the gap slice 15 flagged but
 * never built) — the operator supplies ONLY `id`; `embedKey` is ALWAYS
 * system-generated server-side (`tenant-handlers.ts`'s own
 * `createTenantCreateHandler` docstring), so this client never has one to
 * send. Both `tenant-id-taken` (the reachable collision an operator can
 * actually trigger by typing an id already in use) and `embed-key-taken`
 * (near-unreachable, but never assumed impossible — same discipline
 * `postRotateEmbedKey` below already establishes) surface as their OWN
 * distinct reason, never collapsed into a generic error: launch prompt §1's
 * own "surface its refusal reason honestly rather than re-implementing the
 * check in front of it," read literally through to this client's own return
 * type.
 */
export async function postTenantCreate(id: string): Promise<TenantCreateOutcome> {
  let response: Response;
  try {
    response = await fetch("/tenants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id }),
    });
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (response.status === 403) return { ok: false, reason: "missing-permission" };
  if (response.status === 400) return { ok: false, reason: "invalid-payload" };
  if (response.status === 409) {
    const body = (await response.json()) as { readonly error: string };
    return { ok: false, reason: body.error === "embed-key-taken" ? "embed-key-taken" : "tenant-id-taken" };
  }
  if (response.status !== 201) return { ok: false, reason: "no-session" };
  const body = (await response.json()) as { readonly tenant: TenantDetailApiRow };
  return { ok: true, tenant: body.tenant };
}

export type TenantWriteOutcome =
  | { readonly ok: true; readonly tenant: TenantDetailApiRow }
  | { readonly ok: false; readonly reason: "no-session" | "missing-permission" | "unknown-tenant" | "invalid-payload" | "network-error" };

/**
 * `POST /tenants/:id/origins` (tasks 15a.1/15a.2). Same four-way session/
 * permission/network mapping `getTenantDetail` already establishes, plus
 * `invalid-payload` for the handler's own 400 (a malformed body — never
 * reachable through this app's own editor, which always sends a real
 * string array via `parseListInput`, but a real status this client must
 * still map rather than silently swallow).
 */
export async function postTenantOrigins(id: string, origins: readonly string[]): Promise<TenantWriteOutcome> {
  let response: Response;
  try {
    response = await fetch(`/tenants/${encodeURIComponent(id)}/origins`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ origins }),
    });
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (response.status === 403) return { ok: false, reason: "missing-permission" };
  if (response.status === 404) return { ok: false, reason: "unknown-tenant" };
  if (response.status === 400) return { ok: false, reason: "invalid-payload" };
  if (response.status !== 200) return { ok: false, reason: "no-session" };
  const body = (await response.json()) as { readonly tenant: TenantDetailApiRow };
  return { ok: true, tenant: body.tenant };
}

/** `POST /tenants/:id/games` (tasks 15a.3/15a.4) — structurally identical to
 * `postTenantOrigins` above, same outcome shape. */
export async function postTenantGames(id: string, games: readonly string[]): Promise<TenantWriteOutcome> {
  let response: Response;
  try {
    response = await fetch(`/tenants/${encodeURIComponent(id)}/games`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ games }),
    });
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (response.status === 403) return { ok: false, reason: "missing-permission" };
  if (response.status === 404) return { ok: false, reason: "unknown-tenant" };
  if (response.status === 400) return { ok: false, reason: "invalid-payload" };
  if (response.status !== 200) return { ok: false, reason: "no-session" };
  const body = (await response.json()) as { readonly tenant: TenantDetailApiRow };
  return { ok: true, tenant: body.tenant };
}

/** `POST /tenants/:id/window` (tasks 15a.5/15a.6) — `validUntilIso` MUST
 * already be a `"YYYY-MM-DD"` string (the caller's own `argentineDateToIso`,
 * `tenant-detail.ts`); this client never touches the Buenos Aires
 * conversion itself, only relays the already-converted date. */
export async function postTenantWindow(id: string, validUntilIso: string): Promise<TenantWriteOutcome> {
  let response: Response;
  try {
    response = await fetch(`/tenants/${encodeURIComponent(id)}/window`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ validUntil: validUntilIso }),
    });
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (response.status === 403) return { ok: false, reason: "missing-permission" };
  if (response.status === 404) return { ok: false, reason: "unknown-tenant" };
  if (response.status === 400) return { ok: false, reason: "invalid-payload" };
  if (response.status !== 200) return { ok: false, reason: "no-session" };
  const body = (await response.json()) as { readonly tenant: TenantDetailApiRow };
  return { ok: true, tenant: body.tenant };
}

/** `POST /tenants/:id/embed-key/rotate` (task 15b.1/15b.2) — no body at all:
 * the new key is entirely server-generated, never operator-typed. The
 * UI's own confirmation step happens BEFORE this is ever called (launch
 * prompt §3: rotation is destructive). */
export async function postRotateEmbedKey(id: string): Promise<TenantWriteOutcome> {
  let response: Response;
  try {
    response = await fetch(`/tenants/${encodeURIComponent(id)}/embed-key/rotate`, { method: "POST", credentials: "include" });
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (response.status === 403) return { ok: false, reason: "missing-permission" };
  if (response.status === 404) return { ok: false, reason: "unknown-tenant" };
  if (response.status !== 200) return { ok: false, reason: "invalid-payload" };
  const body = (await response.json()) as { readonly tenant: TenantDetailApiRow };
  return { ok: true, tenant: body.tenant };
}

export type TenantThemeWriteOutcome =
  | { readonly ok: true; readonly tenant: TenantDetailApiRow; readonly themeViolations: readonly ThemeContrastViolation[] }
  | { readonly ok: false; readonly reason: "no-session" | "missing-permission" | "unknown-tenant" | "invalid-payload" | "network-error" };

/**
 * `POST /tenants/:id/theme` (tasks 15b.3/15b.4) — the ONLY write client that
 * carries `themeViolations` back alongside the fresh tenant row (design
 * §2.3's own point: violations must reach the operator's screen, never only
 * a server log). `theme` is sent AS GIVEN — the FORM'S own inputs already
 * constrain it to the 7 `THEME_TOKEN_NAMES` keys; `sanitizeTenantTheme`
 * (server-side, inside `updateTheme`) is what actually enforces the closed
 * vocabulary and the contrast minimum, never this client.
 */
export async function postTenantTheme(id: string, theme: ThemeOverride): Promise<TenantThemeWriteOutcome> {
  let response: Response;
  try {
    response = await fetch(`/tenants/${encodeURIComponent(id)}/theme`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ theme }),
    });
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (response.status === 403) return { ok: false, reason: "missing-permission" };
  if (response.status === 404) return { ok: false, reason: "unknown-tenant" };
  if (response.status === 400) return { ok: false, reason: "invalid-payload" };
  if (response.status !== 200) return { ok: false, reason: "no-session" };
  const body = (await response.json()) as { readonly tenant: TenantDetailApiRow; readonly themeViolations: readonly ThemeContrastViolation[] };
  return { ok: true, tenant: body.tenant, themeViolations: body.themeViolations };
}

export type OperatorListOutcome =
  | { readonly ok: true; readonly operators: readonly OperatorListApiRow[] }
  | { readonly ok: false; readonly reason: "no-session" | "missing-permission" | "network-error" };

/**
 * `GET /operators` (task 16a.1) — the operator directory both the operator
 * list AND the permission matrix (task 16a.6) read from. Same three-way
 * session/permission/network mapping `getTenants` already establishes; no
 * `unknown-tenant`-shaped fourth reason exists here, since this route names
 * no single resource by id.
 */
export async function getOperators(): Promise<OperatorListOutcome> {
  let response: Response;
  try {
    response = await fetch("/operators", { headers: { accept: "application/json" }, credentials: "include" });
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (response.status === 403) return { ok: false, reason: "missing-permission" };
  if (response.status !== 200) return { ok: false, reason: "no-session" };
  const body = (await response.json()) as { readonly operators: readonly OperatorListApiRow[] };
  return { ok: true, operators: body.operators };
}

export type OperatorCreateOutcome =
  | { readonly ok: true; readonly id: string; readonly username: string }
  | { readonly ok: false; readonly reason: "no-session" | "missing-permission" | "username-taken" | "invalid-payload" | "network-error" };

/**
 * `POST /operators` (tasks 16a.2/16a.3) — surfaces the server's own
 * `username-taken` refusal (`operator-handlers.ts`'s own
 * `createOperatorCreateHandler`, 409) as its OWN distinct reason, never
 * collapsed into a generic error, the identical discipline
 * `postTenantCreate` already establishes for `tenant-id-taken`.
 */
export async function postOperatorCreate(username: string, password: string): Promise<OperatorCreateOutcome> {
  let response: Response;
  try {
    response = await fetch("/operators", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (response.status === 403) return { ok: false, reason: "missing-permission" };
  if (response.status === 400) return { ok: false, reason: "invalid-payload" };
  if (response.status === 409) return { ok: false, reason: "username-taken" };
  if (response.status !== 201) return { ok: false, reason: "no-session" };
  const body = (await response.json()) as { readonly id: string; readonly username: string };
  return { ok: true, id: body.id, username: body.username };
}

export type OperatorLifecycleOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "no-session" | "missing-permission" | "unknown-operator" | "last-account-manager" | "network-error" };

/**
 * `POST /operators/:id/disable` (task 16a.4) — surfaces
 * `last-account-manager` (design §8's own guard, wired via
 * `operator-handlers.ts`'s `createOperatorDisableHandler`) as its OWN
 * distinct reason, so `OperatorsScreen.tsx` can render the real constraint
 * rather than a generic error, exactly the "surface the refusal reason
 * honestly" discipline `postTenantCreate`'s own docstring already states.
 */
export async function postOperatorDisable(id: string): Promise<OperatorLifecycleOutcome> {
  let response: Response;
  try {
    response = await fetch(`/operators/${encodeURIComponent(id)}/disable`, { method: "POST", credentials: "include" });
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (response.status === 403) return { ok: false, reason: "missing-permission" };
  if (response.status === 404) return { ok: false, reason: "unknown-operator" };
  if (response.status === 409) return { ok: false, reason: "last-account-manager" };
  if (response.status !== 200) return { ok: false, reason: "no-session" };
  return { ok: true };
}

/** `POST /operators/:id/enable` (task 16a.4) — never routed through the
 * last-account-manager guard server-side (`enableOperator`'s own docstring:
 * enabling can only add a holder back), so this outcome never names that
 * reason, even though the shared `OperatorLifecycleOutcome` type allows it
 * for the disable case above. */
export async function postOperatorEnable(id: string): Promise<OperatorLifecycleOutcome> {
  let response: Response;
  try {
    response = await fetch(`/operators/${encodeURIComponent(id)}/enable`, { method: "POST", credentials: "include" });
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (response.status === 403) return { ok: false, reason: "missing-permission" };
  if (response.status === 404) return { ok: false, reason: "unknown-operator" };
  if (response.status !== 200) return { ok: false, reason: "no-session" };
  return { ok: true };
}

export type PermissionGrantOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "no-session" | "missing-permission" | "unknown-operator" | "network-error" };

/** `POST /operators/:id/permissions/grant` (task 16a.5) — never surfaces
 * `last-account-manager`: granting can only WIDEN the guarded holder set,
 * the same argument `permission-handlers.ts`'s own docstring already makes
 * for why the server-side guard needs no wiring on this path at all. */
export async function postPermissionGrant(operatorId: string, permission: Permission): Promise<PermissionGrantOutcome> {
  let response: Response;
  try {
    response = await fetch(`/operators/${encodeURIComponent(operatorId)}/permissions/grant`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ permission }),
    });
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (response.status === 403) return { ok: false, reason: "missing-permission" };
  if (response.status === 404) return { ok: false, reason: "unknown-operator" };
  if (response.status !== 200) return { ok: false, reason: "no-session" };
  return { ok: true };
}

export type PermissionRevokeOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "no-session" | "missing-permission" | "not-granted" | "last-account-manager" | "network-error" };

/** `POST /operators/:id/permissions/revoke` (task 16a.5) — the ONE client
 * call the permission matrix's own `wouldTripLastAccountManagerGuard` hint
 * (`permission-matrix.ts`) exists beside: this function still ALWAYS
 * attempts the real call and maps a genuine `last-account-manager` 409
 * distinctly from `not-granted`, because the hint is client-side only and a
 * race between two operators can still reach this exact response even when
 * the hint said it was safe. */
export async function postPermissionRevoke(operatorId: string, permission: Permission): Promise<PermissionRevokeOutcome> {
  let response: Response;
  try {
    response = await fetch(`/operators/${encodeURIComponent(operatorId)}/permissions/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ permission }),
    });
  } catch {
    return { ok: false, reason: "network-error" };
  }
  if (response.status === 403) return { ok: false, reason: "missing-permission" };
  if (response.status === 409) return { ok: false, reason: "last-account-manager" };
  if (response.status === 404) return { ok: false, reason: "not-granted" };
  if (response.status !== 200) return { ok: false, reason: "no-session" };
  return { ok: true };
}

/**
 * `POST /logout` — idempotent by construction on the server side
 * (`logout-handler.ts`'s own docstring: "every case still returns 200 with
 * a clearing cookie"), so this client never inspects the response at all:
 * `AppShell` always transitions back to the login screen after calling
 * this, whether or not a session existed to revoke.
 */
export async function postLogout(): Promise<void> {
  try {
    await fetch("/logout", { method: "POST", credentials: "include" });
  } catch {
    // Best-effort: the SERVER-SIDE row (`operator_sessions`) is what
    // actually revokes a session (`logout-handler.ts`'s own docstring); a
    // network failure here just means that row was not deleted, but
    // `AppShell` still shows the login screen either way, and the current
    // session (if it somehow survived) simply expires on its own 8-hour
    // absolute lifetime.
  }
}
