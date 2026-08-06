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
import { renderEmbedShell } from "./embed-shell.js";
import { handleEmbedRequest } from "./embed-handler.js";
import { handlePresenceRequest } from "./presence-handler.js";
import { serveWidgetAppAsset } from "./static-widget-app.js";

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
const presenceIpLimiter = createRateLimiter(config.presenceIpRateLimit);
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

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/embed") {
    // Content negotiation on ONE path (design's own `/embed` URL contract,
    // "Expensive to reverse"): a real browser navigating the iframe's `src`
    // sends `Accept: text/html` and gets the static shell; the widget-app
    // bundle then calls back into this SAME path with an explicit
    // `Accept: application/json` to mint its session token and catalog.
    if (req.method === "GET" && (req.headers.accept ?? "").includes("text/html")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(renderEmbedShell());
      return;
    }
    handleEmbedRequest(url, req.headers.origin, req.socket.remoteAddress, {
      repository,
      issuer,
      ttlSeconds: config.sessionTtlSeconds,
      ipLimiter: embedIpLimiter,
      keyLimiter: embedKeyLimiter,
      registry,
    })
      .then(({ status, body }) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(500);
        res.end();
      });
    return;
  }

  if (url.pathname === "/presence") {
    const { status, body } = handlePresenceRequest(url, req.socket.remoteAddress, {
      registry,
      pool: presencePool,
      poolKey: GLOBAL_POOL_KEY,
      ipLimiter: presenceIpLimiter,
    });
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
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
