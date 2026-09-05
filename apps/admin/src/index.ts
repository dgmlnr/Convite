import { createServer, type IncomingMessage } from "node:http";
import { fileURLToPath } from "node:url";

import { createRateLimiter, createRedisRateLimiter } from "@hexdev/platform-core";
import type { RateLimiter } from "@hexdev/platform-core";
import {
  connectPostgres,
  connectRedis,
  createPostgresOperatorRepository,
  createPostgresOperatorSessionRepository,
  createPostgresTenantAdminRepository,
  disableOperator,
  enableOperator,
  findOperatorAuthorizationContext,
  grantPermission,
  revokePermission,
} from "@hexdev/platform-core/node";

import { authorizeAndDispatch, type AdminHandler, type AdminRequest, type AuthorizationQuery } from "./authorization.js";
import { isSameOriginRequest } from "./csrf.js";
import { loadAdminConfig } from "./config.js";
import { handleLoginRequest } from "./login-handler.js";
import { handleLogoutRequest } from "./logout-handler.js";
import { createOperatorCreateHandler, createOperatorDisableHandler, createOperatorEnableHandler, type OperatorHandlersDeps } from "./operator-handlers.js";
import { createOwnPasswordHandler } from "./own-password-handler.js";
import { createPermissionGrantHandler, createPermissionRevokeHandler, type PermissionHandlersDeps } from "./permission-handlers.js";
import { resolveAdminRoute, type AdminRouteKind } from "./routing.js";
import { serveBuiltAsset, serveIndexHtml } from "./static-app.js";
import { createTenantDetailHandler, createTenantListHandler, createTenantOriginsHandler } from "./tenant-handlers.js";

/**
 * The admin panel's composition root — the FOURTH composition root in this
 * repository (mint-server, server, widget-app came before it), and the
 * first HTTP surface built for human interaction: forms, session cookies,
 * write endpoints.
 *
 * WHAT THIS APP DELIBERATELY DOES NOT HOLD: the Ed25519 signing seed. See
 * `config.ts`'s own docstring and `no-signing-seed.test.ts` for the
 * mechanically-checked claim — "compromise admin ⇒ cannot mint" is
 * structural here, not a policy, and this file's own imports are part of
 * what that fence verifies.
 *
 * STATUS (slice 11a of tenant-administration, THIS PR): every
 * `access: "permission"` route, PLUS `own-password` (`access:
 * "authenticated"` — see below), now passes through the single authorization
 * checkpoint (`authorization.ts`, `authorizeAndDispatch`) before reaching its
 * handler. `REAL_HANDLERS` below resolves `operator-create`/
 * `operator-disable`/`operator-enable`/`own-password` to their real
 * implementations (`operator-handlers.ts`/`own-password-handler.ts`, slice
 * 11a); every other permission-guarded kind still stubs 501 via
 * `notImplementedHandler` (tenant CRUD/permission grant-revoke/audit viewer
 * arrive PR15/PR15/PR22). `login-submit`/`logout` (slice 8b, unchanged) stay
 * wired OUTSIDE this checkpoint entirely, to their own real handlers against
 * a REAL Postgres-backed `OperatorRepository`/`OperatorSessionRepository`.
 *
 * `own-password` NOW joins the checkpoint, closing the scope boundary a
 * PRIOR revision of this file disclosed rather than silently decided:
 * design §6.2's own table guards it `authenticated` only (task 7.7's
 * three-member exemption — a permission gate here is unsatisfiable for a
 * zero-permission operator), so it reaches `authorizeAndDispatch` through an
 * explicit `route.kind === "own-password"` check alongside the
 * data-driven `access: "permission"` test, rather than broadening that test
 * itself — `logout` deliberately does NOT join it: its own
 * idempotent-regardless-of-cookie behaviour (PR10d) needs no
 * `AuthorizedOperator` at all, and broadening the condition to cover every
 * `authenticated` route would silently change that settled, tested property.
 *
 * `AdminRequest.body` (this PR): the FIRST guarded route needing one —
 * parsed once by `readJsonBody` before `authorizeAndDispatch` runs, never by
 * a handler touching `node:http` itself.
 */
const config = loadAdminConfig(process.env);

// The built SPA's own output directory (task 14's own static-serving PR) —
// a sibling of THIS compiled file's own directory (`dist/index.js` ->
// `../dist-ui`), the identical relative-path convention
// `apps/mint-server/src/index.ts`'s own `widgetAppDistDir` already
// establishes for `apps/widget-app/dist-app`.
const adminUiDistDir = fileURLToPath(new URL("../dist-ui", import.meta.url));

// Same "throw, crash boot" convention `apps/server`/`apps/mint-server` both
// already establish for their own Postgres pools — an unreachable database
// at boot must crash this process, never let it start half-wired.
const postgresPool = await connectPostgres(config.postgresUrl);
const operators = createPostgresOperatorRepository(postgresPool);
const sessions = createPostgresOperatorSessionRepository(postgresPool);
const tenants = createPostgresTenantAdminRepository(postgresPool);

// The authorization checkpoint's own one-query join (design §7, task 9.2),
// bound to THIS process's own pool — the same "one knob per composition
// root" shape every other Postgres-backed adapter above already follows.
const authorizationQuery: AuthorizationQuery = (tokenHash) => findOperatorAuthorizationContext(postgresPool, tokenHash);

// Same "one knob, both flip together" convention every other role's own
// Redis-backed rate limiters already follow (`apps/mint-server/src/index.ts`,
// `apps/server/src/index.ts`) — `redisUrl` unset means both stay in-memory,
// correct for this panel's expected single-instance deployment (design §7's
// own "single-digit operators" scale).
const redis = config.redisUrl !== undefined ? await connectRedis(config.redisUrl) : undefined;
const loginUserLimiter: RateLimiter =
  redis !== undefined ? createRedisRateLimiter({ redis, ...config.loginUserRateLimit, keyPrefix: "rl:admin-login-user" }) : createRateLimiter(config.loginUserRateLimit);
const loginIpLimiter: RateLimiter =
  redis !== undefined ? createRedisRateLimiter({ redis, ...config.loginIpRateLimit, keyPrefix: "rl:admin-login-ip" }) : createRateLimiter(config.loginIpRateLimit);

/**
 * Slice 11a's own real handlers — the FIRST production callers of
 * `appendAuditEntry` (design §9's own closing argument): `operator-handlers.ts`
 * builds every `WriteWitness` as `(exec) => appendAuditEntry(exec, {...})`,
 * bound to whichever mutation it accompanies. `disableOperator`/
 * `enableOperator` are bound to THIS process's own pool — same "one knob per
 * composition root" shape every other Postgres-backed adapter above already
 * follows.
 */
const operatorHandlersDeps: OperatorHandlersDeps = {
  operators,
  disableOperator: (id, w) => disableOperator(postgresPool, id, w),
  enableOperator: (id, w) => enableOperator(postgresPool, id, w),
};
const operatorCreateHandler = createOperatorCreateHandler(operatorHandlersDeps);
const operatorDisableHandler = createOperatorDisableHandler(operatorHandlersDeps);
const operatorEnableHandler = createOperatorEnableHandler(operatorHandlersDeps);
const ownPasswordHandler = createOwnPasswordHandler({ operators });

/**
 * Slice 12's own real handlers (`permission-handlers.ts`) — `grantPermission`/
 * `revokePermission` bound to THIS process's own pool, same "one knob per
 * composition root" shape every Postgres-bound function above already
 * follows. `revokePermission` reuses `withLastAccountManagerGuard` (design
 * §8) internally; this composition root wires it exactly like
 * `disableOperator` above, with no bespoke plumbing of its own.
 */
const permissionHandlersDeps: PermissionHandlersDeps = {
  grantPermission: (id, permission, grantedBy, w) => grantPermission(postgresPool, id, permission, grantedBy, w),
  revokePermission: (id, permission, w) => revokePermission(postgresPool, id, permission, w),
};
const permissionGrantHandler = createPermissionGrantHandler(permissionHandlersDeps);
const permissionRevokeHandler = createPermissionRevokeHandler(permissionHandlersDeps);

/**
 * Slice 14's own first real handler (`tenant-handlers.ts`, task 14.4) — the
 * FIRST guarded route to reach an actual repository call and return real
 * data, rather than a 501 stub. Bound to THIS process's own pool, same
 * "one knob per composition root" shape every Postgres-backed adapter above
 * already follows. No `WriteWitness` here at all: `list()` is a read, and
 * design §2.3's non-optional witness only applies to the six MUTATING
 * methods on this same port.
 */
const tenantListHandler = createTenantListHandler({ tenants });
// Slice 15's own first real handler beyond the list — `GET /tenants/:id`,
// the read side of tenant detail CRUD. Same "no `WriteWitness` here" reason
// as `tenantListHandler` above: this is a read, and design §2.3's
// non-optional witness only applies to `TenantAdminRepository`'s six
// MUTATING methods.
const tenantDetailHandler = createTenantDetailHandler({ tenants });
// Task 15a.1/15a.2 — the FIRST real write this app performs against
// `TenantAdminRepository` from an actual route (design §2.3's write port,
// built in slice 4, unconsumed by any handler until now). Builds its own
// `WriteWitness` as `(exec) => appendAuditEntry(exec, {...})`, the exact
// shape `operator-handlers.ts`/`permission-handlers.ts` already establish.
const tenantOriginsHandler = createTenantOriginsHandler({ tenants });

/**
 * Maps the still-small set of `AdminRouteKind`s with a REAL handler to that
 * handler — every kind absent from this map keeps stubbing 501 via
 * `notImplementedHandler` below (tenant CRUD/audit viewer arrive PR16-22).
 * Purely data-driven, same "no enumeration to keep in sync" property the
 * checkpoint's own dispatch condition already has — a kind added here needs
 * no change to the dispatch condition itself.
 */
const REAL_HANDLERS: Partial<Record<AdminRouteKind, AdminHandler>> = {
  "operator-create": operatorCreateHandler,
  "operator-disable": operatorDisableHandler,
  "operator-enable": operatorEnableHandler,
  "own-password": ownPasswordHandler,
  "operator-permissions-grant": permissionGrantHandler,
  "operator-permissions-revoke": permissionRevokeHandler,
  "tenant-list": tenantListHandler,
  "tenant-detail": tenantDetailHandler,
  "tenant-origins": tenantOriginsHandler,
};

/**
 * Reads and JSON-parses a request body — the identical shape every existing
 * handler in this fleet that needs one hand-rolls inline (there is no
 * shared body-reading utility anywhere in this repo to reuse), kept inside
 * the `c8 ignore` glue below because it is pure Node stream plumbing with no
 * decision logic of its own: `login-handler.ts`'s own tests already pin
 * every DECISION this endpoint makes from a parsed `{ username, password }`
 * pair onward.
 */
function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw === "" ? {} : (JSON.parse(raw) as Record<string, unknown>));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Every REAL permission-guarded route still stubs 501 in this slice (tenant
 * CRUD/operator management/audit viewer arrive PR12+/slices 11-16) — but,
 * unlike PR8c's own bare stub, this one is a genuine `AdminHandler` (design
 * §6.3 Layer 2), reached ONLY after `authorize` succeeds. This is what
 * "wired through the dispatcher" (task 9.4) means concretely: `actor` is a
 * real, minted `AuthorizedOperator` by the time this runs, not a value some
 * future handler will have to remember to thread through later.
 */
const notImplementedHandler: AdminHandler = async () => ({ status: 501, body: JSON.stringify({ error: "not-implemented" }) });

/* c8 ignore start — the HTTP plumbing; `resolveAdminRoute`, `loadAdminConfig`,
 * `handleLoginRequest`, and `handleLogoutRequest` are what the tests pin,
 * exactly as `apps/mint-server/src/index.ts` already documents for its own
 * dispatcher. */
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const method = req.method ?? "GET";

  // CSRF, design §11.2's second half (tasks 8b.5/8b.6): every NON-GET admin
  // route, with NO exemption — including `login-submit`, which is itself a
  // POST. This runs BEFORE `resolveAdminRoute` is even consulted for intent:
  // a route that does not exist yet (still a 501 stub) gets the identical
  // protection a wired one will, so no future handler can be added without
  // it. `SameSite=Strict` (session-cookie.ts) is the first, primary defence;
  // this is belt-and-braces for a browser that ignores it.
  if (method !== "GET" && !isSameOriginRequest(req.headers.origin, req.headers.referer, config.selfOrigin)) {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "cross-origin request refused" }));
    return;
  }

  const route = resolveAdminRoute(method, url.pathname);

  // THE SINGLE AUTHORIZATION CHECKPOINT (design §6.3 Layers 2-3/§7, spec
  // Domain K, tasks 9.1-9.4): every `access: "permission"` route resolves
  // through `authorizeAndDispatch` BEFORE the switch below is ever reached —
  // `route.guard.access === "permission"` is a purely data-driven test, so a
  // future route added to `routing.ts`'s table is checkpointed automatically,
  // with no enumeration by kind here to keep in sync. `route.kind ===
  // "own-password"` joins it explicitly (PR13, slice 11a): design §6.2's own
  // table guards it `authenticated` only (task 7.7's disclosed three-member
  // exemption — a permission gate here is unsatisfiable for a zero-permission
  // operator), but `authorize` still validates session+`enabled` for it, the
  // same deferred scope `index.ts`'s own prior docstring already named in
  // advance. `logout` stays OUTSIDE this checkpoint, unchanged: its own
  // idempotent-regardless-of-cookie behaviour (PR10d) needs no
  // `AuthorizedOperator` at all. On refusal, `resolveHandler` below is never
  // reached; on success, the resolved handler runs (a REAL one for
  // `operator-create`/`operator-disable`/`operator-enable`/`own-password`,
  // `notImplementedHandler` for every other kind still awaiting its own
  // slice), only AFTER `authorize` has already minted a real
  // `AuthorizedOperator`.
  if (route.guard.access === "permission" || route.kind === "own-password") {
    const handler = REAL_HANDLERS[route.kind] ?? notImplementedHandler;
    const dispatch = (body: Record<string, unknown>) => {
      const adminRequest: AdminRequest = { params: route.params, body };
      authorizeAndDispatch(req.headers.cookie, route.guard, { query: authorizationQuery }, adminRequest, handler)
        .then((response) => {
          res.writeHead(response.status, { "content-type": "application/json" });
          res.end(response.body);
        })
        .catch(() => {
          // Design §15: an unreachable Postgres at request time fails closed,
          // never silently treated as authorized. This is the checkpoint's own
          // equivalent of `tenant-lookup-failed` -> 503 (embed-handler.ts) —
          // 500 here, since there is no tenant-vs-lookup distinction to draw.
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "authorization-check-failed" }));
        });
    };
    // `GET` routes (`tenant-list`/`tenant-detail`/`operator-list`/`audit-view`)
    // carry no body to parse — same "read the body only for a method that
    // can have one" shape `login-submit` already establishes below.
    if (method === "GET") {
      dispatch({});
    } else {
      readJsonBody(req)
        .then(dispatch)
        .catch(() => {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "malformed request body" }));
        });
    }
    return;
  }

  switch (route.kind) {
    case "login-submit":
      readJsonBody(req)
        .then(async (body) => {
          const username = typeof body.username === "string" ? body.username : undefined;
          const password = typeof body.password === "string" ? body.password : undefined;
          const result = await handleLoginRequest(username, password, {
            operators,
            sessions,
            userLimiter: loginUserLimiter,
            ipLimiter: loginIpLimiter,
            clientIp: req.socket.remoteAddress,
            cookieSecure: config.cookieSecure,
          });
          const headers: Record<string, string> = { "content-type": "application/json" };
          if (result.setCookie !== undefined) headers["set-cookie"] = result.setCookie;
          res.writeHead(result.status, headers);
          res.end(result.body);
        })
        .catch(() => {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "malformed request body" }));
        });
      return;

    case "logout":
      handleLogoutRequest(req.headers.cookie, { sessions, cookieSecure: config.cookieSecure }).then((result) => {
        res.writeHead(result.status, { "content-type": "application/json", "set-cookie": result.setCookie });
        res.end(result.body);
      });
      return;

    // The SPA's own entry point (task 14's static-serving PR) — served
    // regardless of session state, PUBLIC on purpose: the CLIENT-SIDE
    // `AppShell` is what decides whether to render the login screen or the
    // tenant list, via its own `GET /` fetch (`ui/api.ts`'s own docstring on
    // why this app must serve its own UI, same-origin, rather than a
    // separate dev-server proxying across).
    case "login-form":
      serveIndexHtml(adminUiDistDir).then((result) => {
        res.writeHead(result.status, { "content-type": result.contentType });
        res.end(result.body);
      });
      return;

    // The built JS/CSS bundle `index.html` references (Vite's own default
    // `/assets/*` output path — no extra `base` config needed). `file` is
    // always present here: `resolveAdminRoute` never resolves an `asset`
    // kind without it (`routing.ts`'s own `assetFileName`, already
    // traversal-sanitized before this handler ever sees the value) — the
    // `?? ""` fallback is defense-in-depth only (a 404, never a crash, if
    // that invariant were ever broken), same optional-chaining discipline
    // `operator-handlers.ts`'s own `req.params?.id` already establishes.
    case "asset":
      serveBuiltAsset(adminUiDistDir, route.params?.file ?? "").then((result) => {
        res.writeHead(result.status, { "content-type": result.contentType });
        res.end(result.body);
      });
      return;

    // Every `access: "permission"` kind below is already intercepted by the
    // checkpoint `if` above and NEVER reaches this switch at runtime — they
    // stay listed here only because Layer 1's exhaustive `switch` (design
    // §6.3) demands a case for every real `AdminRouteKind` member, reachable
    // or not. `own-password` is ABSENT from this list on purpose (not an
    // omission): TypeScript's own control-flow narrowing already proves it
    // unreachable here — the earlier `if` includes `route.kind ===
    // "own-password"` and always `return`s, so by the time this switch runs,
    // `route.kind`'s narrowed type no longer even contains that member; a
    // stray `case "own-password":` here is a COMPILE ERROR (`TS2678`), not
    // merely dead code — confirmed by trying it. `tenant-list` stays listed
    // here too even though `REAL_HANDLERS` already resolves it — same
    // "listed but never reached at runtime" shape `operator-create`/
    // `operator-enable`/etc. below already have, since `tenant-list`'s guard
    // is `access: "permission"`, caught by the checkpoint `if` above.
    case "tenant-list":
    case "tenant-detail":
    case "tenant-create":
    case "tenant-origins":
    case "tenant-games":
    case "tenant-window":
    case "tenant-theme":
    case "tenant-rotate-key":
    case "operator-list":
    case "operator-create":
    case "operator-enable":
    case "operator-disable":
    case "operator-permissions-grant":
    case "operator-permissions-revoke":
    case "audit-view":
      // Every OTHER real kind still resolves here — no handler yet. A stub
      // response, rather than `routing.ts` refusing to resolve these paths
      // at all, is what lets `routing.coverage.test.ts` (task 7.7) exercise
      // the FULL route table now, so the permission taxonomy and its closure
      // stay pinned before a handler exists to second-guess them.
      res.writeHead(501, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not-implemented" }));
      return;
    case "not-found":
      res.writeHead(404);
      res.end();
      return;
    default: {
      // Layer 1 (design §6.3): a new `AdminRouteKind` added to `routing.ts`
      // without a matching case above fails `tsc -b` here, never silently
      // at runtime — `route.kind` narrows to `never` only once every real
      // member of the union has its own case.
      const _exhaustive: never = route.kind;
      throw new Error(`unhandled admin route kind: ${String(_exhaustive)}`);
    }
  }
});
/* c8 ignore stop */

server.listen(config.port, () => {
  console.log(`convite admin panel listening on :${String(config.port)}`);
});
