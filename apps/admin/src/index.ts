import { createServer, type IncomingMessage } from "node:http";

import { createRateLimiter, createRedisRateLimiter } from "@hexdev/platform-core";
import type { RateLimiter } from "@hexdev/platform-core";
import { connectPostgres, connectRedis, createPostgresOperatorRepository, createPostgresOperatorSessionRepository } from "@hexdev/platform-core/node";

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
 * STATUS (slice 8b of tenant-administration, COMPLETE): `login-submit` and
 * `logout` are wired to the real handlers built and unit-tested in isolation
 * (`login-handler.ts`/`logout-handler.ts`), against a REAL Postgres-backed
 * `OperatorRepository`/`OperatorSessionRepository` — this app's first
 * workspace dependency on `@hexdev/platform-core`. CSRF applies to every
 * non-GET route with no exemption (`csrf.ts`). Every OTHER route is still a
 * 501 stub. No authorization checkpoint exists yet (that is slice 9) — this
 * slice establishes WHO you are, not WHAT you may do; `own-password` and
 * every tenant/operator/audit route stay unimplemented until later slices.
 */
const config = loadAdminConfig(process.env);

// Same "throw, crash boot" convention `apps/server`/`apps/mint-server` both
// already establish for their own Postgres pools — an unreachable database
// at boot must crash this process, never let it start half-wired.
const postgresPool = await connectPostgres(config.postgresUrl);
const operators = createPostgresOperatorRepository(postgresPool);
const sessions = createPostgresOperatorSessionRepository(postgresPool);

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
