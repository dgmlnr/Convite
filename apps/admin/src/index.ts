import { createServer } from "node:http";

import { loadAdminConfig } from "./config.js";
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
 * STATUS (slice 7 of tenant-administration): this is the skeleton — the
 * route table (`routing.ts`) is the REAL, full surface design §6.2
 * specifies, but every handler below is a 501 stub. No credential store, no
 * Postgres connection, no login, no authorization checkpoint exists yet;
 * those land slice by slice (8a/8b credentials and login, 9 the single
 * authorization checkpoint, 11/12 operator management and RBAC, 14-16 the
 * actual UI). Wiring `loadAdminConfig` here now, ahead of any handler that
 * consumes `postgresUrl`, is what makes the "boot refused when the guard var
 * is unset" behaviour (task 7.2) something `node apps/admin/dist/index.js`
 * can demonstrate for real today, rather than a claim that waits for a later
 * slice to become checkable.
 */
const config = loadAdminConfig(process.env);

/* c8 ignore start — the HTTP plumbing; `resolveAdminRoute` and
 * `loadAdminConfig` are what the tests pin, exactly as
 * `apps/mint-server/src/index.ts` already documents for its own dispatcher. */
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const route = resolveAdminRoute(req.method ?? "GET", url.pathname);

  switch (route.kind) {
    case "login-form":
    case "login-submit":
    case "asset":
    case "logout":
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
      // Every real kind resolves here today — none has a handler yet. A
      // stub response, rather than `routing.ts` refusing to resolve these
      // paths at all, is what lets `routing.coverage.test.ts` (task 7.7)
      // exercise the FULL route table now, so the permission taxonomy and
      // its closure are pinned before a single handler exists to
      // second-guess them.
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
