import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import type { RandomSource } from "@hexdev/platform-contract";
import {
  GLOBAL_POOL_KEY,
  createGameModuleRegistry,
  createJtiReplayGuard,
  createMatchmakingPool,
  createRateLimiter,
  createSessionTokenIssuer,
  createStaticTenantRepository,
} from "@hexdev/platform-core";
import type { SystemActionRequester } from "@hexdev/platform-core";
import { PresenceRoom, createMatchServer } from "@hexdev/transport-colyseus";
import type { PresenceRoomCreateOptions } from "@hexdev/transport-colyseus";
import { requestSystemAction, trucoModule } from "@hexdev/truco-module";
import { loadServerConfig } from "./config.js";
import { renderEmbedShell, type EmbedBootstrap } from "./embed-shell.js";
import { handleEmbedRequest } from "./embed-handler.js";
import { refererOrigin } from "./referer-origin.js";
import { serveLoaderAsset, serveWidgetAppAsset } from "./static-widget-app.js";

// The composition root: wires existing pieces (registry, auth primitives,
// the generic MatchRoom, the deal factory) together. No game rules live
// here — see `truco-module`/`truco-engine` for those.
const config = loadServerConfig(process.env);
const repository = createStaticTenantRepository(config.tenants);
const issuer = createSessionTokenIssuer(config.sessionSecret);
// TTL matches the session token lifetime (obs 2945: bounding this guard was
// the last open memory-exhaustion vector) — a jti cannot be replayed after
// its own token has expired anyway, so holding it any longer is pure waste.
const replayGuard = createJtiReplayGuard({ ttlMs: config.sessionTtlSeconds * 1000 });
// Rate limiting (hardening, obs 2945: /embed is now a REAL public endpoint
// with none). Per-IP + per-key on /embed, per-IP on room join. GUESSED
// defaults, disclosed in config.ts — configurable via env for a real
// deployment to tune once real traffic data exists.
const embedIpLimiter = createRateLimiter(config.embedIpRateLimit);
const embedKeyLimiter = createRateLimiter(config.embedKeyRateLimit);
const joinIpLimiter = createRateLimiter(config.joinIpRateLimit);
// The registry erases per-module state types (same documented boundary as
// `platform-core/registry.ts` itself); this is that one spot for the pairing.
const registry = createGameModuleRegistry([{ module: trucoModule, requestSystemAction: requestSystemAction as SystemActionRequester }]);
// The server is where entropy lives (design §4): the engine never
// randomizes itself. A real CSPRNG, not `Math.random`.
const rng: RandomSource = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
// Lobby presence (design §8): ONE process-wide pool, `GLOBAL_POOL_KEY`
// (cross-tenant matchmaking, the v1 default) — flipping to per-tenant is a
// config value passed here, never a redesign.
const presencePool = createMatchmakingPool();
// `apps/server/dist/index.js` -> `apps/widget-app/dist-app` (the Vite
// APP-mode build's own output dir, deliberately distinct from every
// package's `tsc -b` `dist/` — see apps/widget-app/vite.config.ts).
const widgetAppDistDir = fileURLToPath(new URL("../../widget-app/dist-app", import.meta.url));
// `apps/server/dist/index.js` -> `packages/widget-sdk/dist-iife` (the Vite
// lib-mode IIFE build's own output dir — see packages/widget-sdk/vite.config.ts).
const widgetSdkDistDir = fileURLToPath(new URL("../../../packages/widget-sdk/dist-iife", import.meta.url));

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/embed") {
    // A plain GET navigation to a cross-origin URL — exactly what happens
    // when the loader sets the sandboxed iframe's `src` here — carries NO
    // `Origin` header at all (discovered via a real two-origin Playwright
    // run, not assumed; see referer-origin.ts). `Referer` DOES carry it, and
    // the default `strict-origin-when-cross-origin` policy trims it to
    // exactly the origin for a cross-origin request — this fallback is what
    // makes the origin allowlist check actually reachable by a real browser.
    const origin = req.headers.origin ?? refererOrigin(req.headers.referer);

    handleEmbedRequest(url, origin, req.socket.remoteAddress, {
      repository,
      issuer,
      ttlSeconds: config.sessionTtlSeconds,
      ipLimiter: embedIpLimiter,
      keyLimiter: embedKeyLimiter,
      registry,
    })
      .then(({ status, body }) => {
        // Content negotiation on ONE path (design's own `/embed` URL
        // contract, "Expensive to reverse"): a real browser navigating the
        // iframe's `src` sends `Accept: text/html` and gets the shell with
        // the mint result INLINED (a same-origin fetch from inside the
        // iframe back to this same server would carry no origin evidence at
        // all — see embed-shell.ts). A programmatic caller sending an
        // explicit `Accept: application/json` still gets the plain JSON API.
        if (req.method === "GET" && (req.headers.accept ?? "").includes("text/html")) {
          const bootstrap: EmbedBootstrap | undefined = status === 200 ? (JSON.parse(body) as EmbedBootstrap) : undefined;
          res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
          res.end(renderEmbedShell(bootstrap));
          return;
        }
        res.writeHead(status, { "content-type": "application/json" });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(500);
        res.end();
      });
    return;
  }

  if (url.pathname === "/assets/widget-app.js") {
    serveWidgetAppAsset(widgetAppDistDir)
      .then(({ status, contentType, body }) => {
        res.writeHead(status, { "content-type": contentType });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(500);
        res.end();
      });
    return;
  }

  if (url.pathname === "/loader.js") {
    // The literal URL a tenant's <script src> fetches (design §7's own
    // example snippet: `https://cdn.hexdev/gamify/loader.js`) — served from
    // the SAME origin as `/embed` in this composition root, matching the
    // production intent that WIDGET_ORIGIN and the loader's own host are one
    // and the same origin.
    serveLoaderAsset(widgetSdkDistDir)
      .then(({ status, contentType, body }) => {
        res.writeHead(status, { "content-type": contentType, "cache-control": "public, max-age=300" });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(500);
        res.end();
      });
    return;
  }

  res.writeHead(404);
  res.end();
});

const gameServer = createMatchServer({ httpServer, registry, auth: { issuer, repository, replayGuard, joinRateLimiter: joinIpLimiter }, rng });
// `gameId` is deliberately absent here — the client supplies it at
// createRoom time, same as `MatchRoom`'s own `defaultOptions` pattern.
gameServer.define("presence", PresenceRoom, { registry, pool: presencePool, poolKey: GLOBAL_POOL_KEY } as PresenceRoomCreateOptions);

httpServer.listen(config.port, () => {
  console.log(`hexdev-gamify server listening on :${config.port}`);
});
