import type { OperatorAuthorizationContext, OperatorId } from "@hexdev/platform-core";

import type { Permission } from "./permissions.js";
import type { RouteAccess } from "./routing.js";
import { hashSessionToken, parseSessionCookie } from "./session-cookie.js";

/**
 * THE SINGLE AUTHORIZATION CHECKPOINT (design §6.3 Layers 2-3, §7; spec
 * Domain K; tasks 9.1-9.9) — the last security foundation before the audit
 * log (slice 10) and the screens (slices 13-16). Every guarded admin request
 * resolves through `authorize`, or its dispatching wrapper
 * `authorizeAndDispatch`, before any repository call or handler body runs at
 * all. This module is the ONLY place in this app containing an
 * `as AuthorizedOperator` cast — the brand's own constructor is not
 * exported, only the TYPE is, mirroring `TenantId`'s existing brand idiom
 * (`tenant-auth.ts:7`) and the "capability as a value" shape
 * `SessionTokenSigner`/`SessionTokenVerifier` already establish.
 *
 * THE PROPERTY THIS FILE EXISTS TO PROVE (design §7, spec Domain E's own
 * "session state MUST reflect current account and permission state on every
 * request"): a session is NEVER a cached snapshot of authorization. There is
 * no cache and no TTL anywhere below — `authorize` calls `deps.query` EXACTLY
 * ONCE per invocation and never memoizes across calls, so a revoked
 * permission or a disabled account bites on the very next request, with
 * nothing to invalidate. `authorization.test.ts`'s own "no cache, no TTL"
 * suite proves this directly: the SAME token hash, queried twice through a
 * mutable fake `query`, produces a DIFFERENT `AuthorizeResult` on the second
 * call — not because anything was invalidated, but because nothing was ever
 * cached to begin with.
 *
 * COST, stated plainly rather than left implicit (design §7's own demand,
 * because the reviewer deserves the number, not a hand-wave): one indexed
 * primary-key lookup (`operator_sessions.token_hash`, its own PRIMARY KEY)
 * plus one small `LEFT JOIN`, per guarded request — roughly a millisecond
 * against a warm local pool, at this panel's single-digit-operator scale
 * (design §7's own figure). There is no cache-coherence test to write and no
 * propagation-window bug class to guard against, because the propagation
 * window IS the cache.
 */
export type AuthorizedOperator = {
  readonly id: OperatorId;
  readonly username: string;
  readonly permissions: ReadonlySet<Permission>;
} & { readonly __brand: "AuthorizedOperator" };

/**
 * Injectable so `authorization.test.ts` can prove call COUNT and exact
 * arguments — the same DI seam `operator-password.ts`'s `PasswordComparator`
 * and `login-handler.ts`'s `passwordDeps`/rate limiters already establish.
 * The real production implementation, wired in `index.ts`, is
 * `@hexdev/platform-core`'s `findOperatorAuthorizationContext` bound to this
 * app's own `Pool` — no production caller needs a second query per request;
 * this seam only exists so a test can prove that without Postgres.
 */
export type AuthorizationQuery = (tokenHash: string) => Promise<OperatorAuthorizationContext | undefined>;

export type AuthorizeRefusalReason = "no-session" | "session-expired" | "account-disabled" | "missing-permission";

export type AuthorizeResult = { readonly ok: true; readonly actor: AuthorizedOperator } | { readonly ok: false; readonly reason: AuthorizeRefusalReason };

export interface AuthorizeDeps {
  readonly query: AuthorizationQuery;
  /** Defaults to `Date.now` — never read directly inside this module
   * otherwise, the same `Clock`-injection discipline `tenant-validity.ts`'s
   * own choke points already establish. */
  readonly clock?: () => number;
}

/**
 * THE FIXED CHECK ORDER (design §7, task 9.2) — no row -> refuse; expired ->
 * refuse; disabled -> refuse; missing permission -> refuse; only THEN mint
 * `AuthorizedOperator`. The order is load-bearing, not stylistic: checking
 * `enabled` BEFORE the permission membership test is what keeps a disabled
 * account from learning which permissions it would have held were it still
 * enabled — a disabled account's call NEVER reaches the permission branch,
 * regardless of what rows `operator_permissions` actually holds for it.
 * `authorization.test.ts`'s own "order proof" pins this directly: an
 * operator who is BOTH disabled AND missing the route's permission is
 * refused with `"account-disabled"`, never `"missing-permission"`.
 */
export async function authorize(cookieHeader: string | undefined, guard: RouteAccess, deps: AuthorizeDeps): Promise<AuthorizeResult> {
  const token = parseSessionCookie(cookieHeader);
  if (token === undefined) return { ok: false, reason: "no-session" };

  const context = await deps.query(hashSessionToken(token));
  if (context === undefined) return { ok: false, reason: "no-session" };

  const now = (deps.clock ?? Date.now)();
  if (context.expiresAt <= now) return { ok: false, reason: "session-expired" };
  if (!context.enabled) return { ok: false, reason: "account-disabled" };
  if (guard.access === "permission" && !context.permissions.includes(guard.permission)) {
    return { ok: false, reason: "missing-permission" };
  }

  // Double cast (never a bare `as AuthorizedOperator`): the object literal
  // below is genuinely missing the `__brand` field by construction — that
  // field exists ONLY to make an unbranded object a compile error anywhere
  // outside this one function, so the cast route runs through `unknown`
  // exactly once, here, and nowhere else in this app.
  const actor = {
    id: context.operatorId,
    username: context.username,
    permissions: new Set(context.permissions as Permission[]),
  } as unknown as AuthorizedOperator;
  return { ok: true, actor };
}

/**
 * The minimal request shape a guarded handler needs (design §6.3 Layer 2) —
 * deliberately NOT `node:http`'s own `IncomingMessage`/`ServerResponse`,
 * mirroring `LoginRequestDeps`/`LogoutRequestDeps`'s own framework-agnostic
 * shape so a handler stays testable without a bound socket.
 *
 * `body` (PR13, tenant-administration slice 11a): the FIRST permission/
 * authenticated-guarded route with a real handler that needs one — every
 * route before this slice either read no body (`GET`) or was `login-submit`/
 * `logout`, both wired outside this checkpoint entirely and parsing their own
 * body directly in `index.ts`. Parsed once, by `index.ts`, before
 * `authorizeAndDispatch` runs, so a handler never touches `node:http` itself.
 */
export interface AdminRequest {
  readonly params?: Readonly<Record<string, string>>;
  readonly body?: Readonly<Record<string, unknown>>;
  /** Task 16b.2: the FIRST guarded route with a query string to read —
   * `GET /audit`'s own four filters (actor, tenant, action, date range).
   * Parsed once, by `index.ts`, from the request's own `URL.searchParams`,
   * the same "parse once before the checkpoint runs, never inside a
   * handler" discipline `body` above already establishes for a POST route. */
  readonly query?: Readonly<Record<string, string>>;
}

export interface AdminResponse {
  readonly status: number;
  readonly body: string;
}

/**
 * Every guarded route handler in this app MUST have this shape (design §6.3
 * Layer 2, task 9.4). `actor: AuthorizedOperator` is a REQUIRED parameter —
 * not optional, not defaulted — so a handler literal that omits it is a
 * `tsc` compile error, the same "forgetting is not a runtime state" guarantee
 * `AdminRoute.guard` itself already carries (design §6.3 Layer 1).
 *
 * PROVEN FOR REAL, not merely asserted (matching this chain's own standing
 * bar) — and the FIRST attempt at this proof was itself wrong, worth
 * recording rather than silently fixing: assigning a shorter function
 * literal (`async () => ({...})`, omitting `actor`) to a variable typed
 * `AdminHandler` compiles FINE, because TypeScript permits a function value
 * with fewer parameters to satisfy a function type expecting more (the same
 * rule that lets `arr.map(x => x)` ignore `map`'s own `index`/`array`
 * parameters) — that is not the guarantee this type provides. The REAL
 * guarantee lives at the CALL site: `declare const h: AdminHandler; void
 * h({ params: {} });` (one argument, omitting the actor) was run through
 * `pnpm exec tsc -b apps/admin` and failed for real —
 * `error TS2554: Expected 2 arguments, but got 1.` — because a call
 * expression, unlike a value assignment, must satisfy the full parameter
 * list. The probe was then removed and `tsc -b` confirmed clean again. This
 * is exactly what "a route handler wired without going through `authorize`
 * first" looks like: nobody outside this module can construct an
 * `AuthorizedOperator` at all (the brand cast lives only in `authorize`
 * itself), so the ONLY way to obtain the second argument a call site needs
 * is to have already called `authorize` and won.
 *
 * THE PROPERTY THIS TYPE CLOSES, worth restating because it is this whole
 * slice's reason to exist (design §6.3's own closing paragraph):
 * `AuthorizedOperator` is the SAME value the audit log's non-nullable
 * `actor_operator_id` (slice 10, task 10.6) will demand from every mutating
 * handler. A handler cannot write without holding one, and cannot be
 * audited without having held one — the chain closes by TYPES and atomicity
 * together, not by review discipline.
 */
export type AdminHandler = (req: AdminRequest, actor: AuthorizedOperator) => Promise<AdminResponse>;

/**
 * Ties `authorize` to an `AdminHandler` — the exact mechanism `index.ts`'s
 * dispatcher wires for real (task 9.4), and the same function
 * `authorization.test.ts` calls to prove tasks 9.1/9.3: on refusal, `handler`
 * is NEVER invoked — not "invoked and its result withheld," never called at
 * all — so a handler whose body touches `TenantAdminRepository` cannot leave
 * so much as a call recorded on a refused request. A 403 with a side effect
 * already committed is not authorization; this is what makes that
 * impossible by construction rather than by review discipline.
 *
 * `missing-permission` maps to 403 (authenticated, but lacking authorization
 * for this specific route); every other refusal reason maps to 401 (no
 * usable session at all) — the same authenticated-vs-authorized distinction
 * spec Domain E vs Domain K draws throughout.
 */
export async function authorizeAndDispatch(
  cookieHeader: string | undefined,
  guard: RouteAccess,
  deps: AuthorizeDeps,
  req: AdminRequest,
  handler: AdminHandler,
): Promise<AdminResponse> {
  const result = await authorize(cookieHeader, guard, deps);
  if (!result.ok) {
    return { status: result.reason === "missing-permission" ? 403 : 401, body: JSON.stringify({ error: result.reason }) };
  }
  return handler(req, result.actor);
}
