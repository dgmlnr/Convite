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

import type { TenantDetailApiRow } from "./tenant-detail.js";
import type { TenantListApiRow } from "./tenant-list.js";

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
