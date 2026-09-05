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
