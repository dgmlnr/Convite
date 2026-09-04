import { createServer, type IncomingMessage } from "node:http";

import { createRateLimiter, createRedisRateLimiter } from "@hexdev/platform-core";
import type { RateLimiter } from "@hexdev/platform-core";
import {
  connectPostgres,
  connectRedis,
  createPostgresOperatorRepository,
  createPostgresOperatorSessionRepository,
  findOperatorAuthorizationContext,
} from "@hexdev/platform-core/node";

import { authorizeAndDispatch, type AdminHandler, type AuthorizationQuery } from "./authorization.js";
import { isSameOriginRequest } from "./csrf.js";
import { loadAdminConfig } from "./config.js";
import { handleLoginRequest } from "./login-handler.js";
import { handleLogoutRequest } from "./logout-handler.js";
import { resolveAdminRoute } from "./routing.js";

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
 * STATUS (slice 9 of tenant-administration, THIS PR): every
 * `access: "permission"` route (design §6.2's route table) now passes
 * through the single authorization checkpoint (`authorization.ts`,
 * `authorizeAndDispatch`) BEFORE reaching its own (still-501) stub — a
 * refusal never reaches `notImplementedHandler` at all, the same guarantee
 * a REAL future handler touching `TenantAdminRepository` will inherit for
 * free (`authorization.test.ts` proves this with a call-recording handler).
 * `login-submit`/`logout` (slice 8b, unchanged) stay wired to their own real
 * handlers against a REAL Postgres-backed `OperatorRepository`/
 * `OperatorSessionRepository`.
 *
 * DELIBERATE SCOPE BOUNDARY, disclosed rather than silently decided: `logout`
 * and `own-password` carry guard `access: "authenticated"` (design §6.2), so
 * Domain K's own checkpoint requirement technically covers them too — but
 * task 9's own list names permission-gated routes only (9.1/9.3), neither
 * has a real handler needing an `AuthorizedOperator` yet (`own-password`
 * arrives with Domain J's self-service password change; `logout`'s own
 * idempotent-regardless-of-cookie behaviour, PR10d, is a settled, tested
 * property this PR does not touch), and wiring the checkpoint's session-only
 * branch onto them now would be unrequested scope change to already-shipped,
 * already-tested behaviour. Deferred to whichever slice implements their
 * real handlers, not overlooked.
 *
 * No tenant/operator/audit route has a REAL handler yet — this slice
 * establishes WHAT an authenticated, authorized operator may reach, not the
 * business logic behind any specific action (slices 11/12/14-16).
 */
const config = loadAdminConfig(process.env);

// Same "throw, crash boot" convention `apps/server`/`apps/mint-server` both
// already establish for their own Postgres pools — an unreachable database
// at boot must crash this process, never let it start half-wired.
const postgresPool = await connectPostgres(config.postgresUrl);
const operators = createPostgresOperatorRepository(postgresPool);
const sessions = createPostgresOperatorSessionRepository(postgresPool);

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
  // with no enumeration by kind here to keep in sync. On refusal, the switch
  // below is never entered at all; on success, `notImplementedHandler` still
  // runs (no real business handler exists yet), but only AFTER `authorize`
  // has already minted a real `AuthorizedOperator`.
  if (route.guard.access === "permission") {
    authorizeAndDispatch(req.headers.cookie, route.guard, { query: authorizationQuery }, { params: route.params }, notImplementedHandler)
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

    case "login-form":
    case "asset":
    case "own-password":
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
