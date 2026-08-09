import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import type { RandomSource } from "@hexdev/platform-contract";
import {
  GLOBAL_POOL_KEY,
  createGameModuleRegistry,
  createJtiReplayGuard,
  createMatchmakingPool,
  createRateLimiter,
  createRedisJtiReplayGuard,
  createRedisMatchmakingPool,
  createRedisRateLimiter,
  createSessionTokenIssuer,
  createSessionTokenVerifier,
  createStaticTenantRepository,
} from "@hexdev/platform-core";
import type { JtiReplayGuard, MatchmakingPool, RateLimiter, SystemActionRequester } from "@hexdev/platform-core";
import { PresenceRoom, createMatchServer } from "@hexdev/transport-colyseus";
import type { ExpressAppCallback, PresenceRoomCreateOptions } from "@hexdev/transport-colyseus";
import { requestSystemAction, requestSystemAction2v2, trucoModule, trucoModule2v2 } from "@hexdev/truco-module";
import { loadServerConfig } from "./config.js";
import { renderEmbedShell, type EmbedBootstrap } from "./embed-shell.js";
import { handleEmbedRequest } from "./embed-handler.js";
import { handleSessionRenewRequest } from "./session-renew-handler.js";
import { refererOrigin } from "./referer-origin.js";
import { connectRedis } from "./redis-client.js";
import { serveCardFrontAsset } from "./static-deck-assets.js";
import { serveLoaderAsset, serveWidgetAppAsset } from "./static-widget-app.js";

// The composition root: wires existing pieces (registry, auth primitives,
// the generic MatchRoom, the deal factory) together. No game rules live
// here — see `truco-module`/`truco-engine` for those.
const config = loadServerConfig(process.env);
const repository = createStaticTenantRepository(config.tenants);
// `await` here is deliberate, same "throw, crash boot" convention as
// `connectRedis` below: a missing OR malformed `HEXDEV_SESSION_SIGNING_KEY`
// throws INSIDE `createSessionTokenIssuer` (real Ed25519 key import), never
// silently falling back to an ephemeral key — an ephemeral key would
// invalidate every live session on restart and, worse, differ PER INSTANCE,
// quietly re-breaking the exact fleet-wide consistency #29 just fixed.
const issuer = await createSessionTokenIssuer(config.sessionSigningKey);
// The genuinely mint-incapable construction (`tenant-auth.ts`'s own
// docstring): `MatchRoom`'s auth path below receives ONLY this, never
// `issuer` — the concrete place this whole change's "a verifier need not
// mint" thesis is wired into the running system, not merely unit-proven.
// DISCLOSED LIMITATION, not hidden: THIS process still holds the private
// key too (it mints via `/embed`/`/session/renew` below), so this does not
// yet shrink the "compromise any one instance mints fleet-wide" blast
// radius on its own — see `createSessionTokenIssuer`'s own docstring for
// why EdDSA is a necessary, not sufficient, step toward that, and what a
// future deployment split would need.
const verifier = await createSessionTokenVerifier(issuer.publicKey);

// Horizontal scaling (config.ts's own docstring on `redisUrl`): ONE knob.
// `redis` is `undefined` unless `HEXDEV_REDIS_URL` is set, and every
// Redis-backed port below AND `createMatchServer`'s own `redis` option
// (Colyseus's `RedisPresence`/`RedisDriver`) key off this SAME variable —
// there is no code path that wires only some of them. `connectRedis` fails
// loudly (throws, crashing boot) rather than silently falling back to the
// in-memory adapters on a bad URL — see its own docstring.
const redis = config.redisUrl !== undefined ? await connectRedis(config.redisUrl) : undefined;

// TTL matches the session token lifetime (obs 2945: bounding this guard was
// the last open memory-exhaustion vector) — a jti cannot be replayed after
// its own token has expired anyway, so holding it any longer is pure waste.
const replayGuard: JtiReplayGuard =
  redis !== undefined ? createRedisJtiReplayGuard({ redis, ttlMs: config.sessionTtlSeconds * 1000, keyPrefix: "jti" }) : createJtiReplayGuard({ ttlMs: config.sessionTtlSeconds * 1000 });
// Rate limiting (hardening, obs 2945: /embed is now a REAL public endpoint
// with none). Per-IP + per-key on /embed, per-IP on room join. GUESSED
// defaults, disclosed in config.ts — configurable via env for a real
// deployment to tune once real traffic data exists.
const embedIpLimiter: RateLimiter =
  redis !== undefined ? createRedisRateLimiter({ redis, ...config.embedIpRateLimit, keyPrefix: "rl:embed-ip" }) : createRateLimiter(config.embedIpRateLimit);
const embedKeyLimiter: RateLimiter =
  redis !== undefined ? createRedisRateLimiter({ redis, ...config.embedKeyRateLimit, keyPrefix: "rl:embed-key" }) : createRateLimiter(config.embedKeyRateLimit);
const joinIpLimiter: RateLimiter =
  redis !== undefined ? createRedisRateLimiter({ redis, ...config.joinIpRateLimit, keyPrefix: "rl:join-ip" }) : createRateLimiter(config.joinIpRateLimit);
// The registry erases per-module state types (same documented boundary as
// `platform-core/registry.ts` itself); this is that one spot for the pairing.
const registry = createGameModuleRegistry([
  { module: trucoModule, requestSystemAction: requestSystemAction as SystemActionRequester },
  // The 2v2 module, additive registration (obs 2927/2925's own named gap):
  // same registry, same generic MatchRoom, a distinct gameId. Nothing above
  // this line changed for the 1v1 entry.
  { module: trucoModule2v2, requestSystemAction: requestSystemAction2v2 as SystemActionRequester },
]);
// The server is where entropy lives (design §4): the engine never
// randomizes itself. A real CSPRNG, not `Math.random`.
const rng: RandomSource = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
// Lobby presence (design §8): ONE process-wide pool, `GLOBAL_POOL_KEY`
// (cross-tenant matchmaking, the v1 default) — flipping to per-tenant is a
// config value passed here, never a redesign. Redis-backed when horizontal
// scaling is configured: closes the residual room-creation race
// `RedisDriver`/`RedisPresence` alone do not eliminate (see
// `redis-matchmaking-pool.ts`'s own docstring for the full argument).
const presencePool: MatchmakingPool = redis !== undefined ? createRedisMatchmakingPool({ redis, keyPrefix: "pool" }) : createMatchmakingPool();
// `apps/server/dist/index.js` -> `apps/widget-app/dist-app` (the Vite
// APP-mode build's own output dir, deliberately distinct from every
// package's `tsc -b` `dist/` — see apps/widget-app/vite.config.ts).
const widgetAppDistDir = fileURLToPath(new URL("../../widget-app/dist-app", import.meta.url));
// `apps/server/dist/index.js` -> `packages/widget-sdk/dist-iife` (the Vite
// lib-mode IIFE build's own output dir — see packages/widget-sdk/vite.config.ts).
const widgetSdkDistDir = fileURLToPath(new URL("../../../packages/widget-sdk/dist-iife", import.meta.url));
// `apps/server/dist/index.js` -> `packages/spanish-deck-ui/assets/fronts`
// (checked into the repo directly, never generated/copied — see that
// package's own `front-image.ts` docstring). The widget-app bundle resolves
// card art at RUNTIME relative to wherever it itself is served from
// (`/assets/widget-app.js`), landing on `/assets/fronts/<cardId>.webp` —
// see `static-deck-assets.ts`'s own docstring for the full chain.
const deckFrontsDir = fileURLToPath(new URL("../../../packages/spanish-deck-ui/assets/fronts", import.meta.url));

/**
 * A bare socket — NO custom `request` listener of our own. THE REAL BUG
 * this fixed, found running a genuine browser join (not assumed):
 * `colyseus`'s `WebSocketTransport` attaches its OWN Express app as a
 * `request` listener on whatever `http.Server` it is given (verified in the
 * installed `@colyseus/ws-transport` source). A SEPARATE plain listener
 * registered here (the previous shape of this file) raced it: Node invokes
 * every `request` listener on a shared server, in registration order, and
 * whichever finishes first wins the response — ours, running first and
 * unconditionally ending unrecognized paths, silently ate the HTTP
 * matchmake handshake `@colyseus/sdk`'s `join`/`joinOrCreate`/`create`
 * perform before upgrading to a WebSocket (a 404 every time), and once that
 * was fixed to fall through instead, colyseus's OWN Express app (once its
 * routes were properly bound, see the `gameServer.listen` comment below)
 * raced OUR async file-read responses for `/embed`/`/loader.js` and
 * crashed with `ERR_HTTP_HEADERS_SENT` on whichever wrote second. Both are
 * now genuinely impossible: every custom route below is registered on
 * colyseus's OWN Express app via the `express` option, so there is exactly
 * ONE router, with normal Express route-matching semantics, no race.
 */
const httpServer = createServer();

/**
 * This composition root's own HTTP routes (`/embed`, `/loader.js`,
 * `/assets/widget-app.js`), registered onto colyseus's OWN Express app —
 * see `createMatchServer`'s `express` option (`transport-colyseus/server.ts`)
 * and the `httpServer` docstring above for why this is no longer a second,
 * racing request listener.
 */
const registerCustomRoutes: ExpressAppCallback = (app) => {
  app.get("/embed", (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
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
  });

  // Renews a session token immediately before a join (obs 2968), instead of
  // the widget carrying the `/embed` page-load bootstrap token around until
  // the player finally decides to play — reads the SAME Origin/Referer
  // evidence `/embed` does (a real browser fetch from inside the iframe
  // carries no `Origin` header on a same-origin GET either, same discovery
  // as `/embed`'s own; POST is used here specifically because it reliably
  // does), but checks it against THIS server's own widget origins, not a
  // tenant's page origin — see `handleSessionRenewRequest`'s own docstring.
  // Reuses the SAME rate limiters `/embed` already enforces: not a fresh,
  // separately-budgeted surface.
  app.post("/session/renew", (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const origin = req.headers.origin ?? refererOrigin(req.headers.referer);

    handleSessionRenewRequest(url, origin, req.socket.remoteAddress, {
      repository,
      issuer,
      ttlSeconds: config.sessionTtlSeconds,
      allowedWidgetOrigins: config.allowedWidgetOrigins,
      ipLimiter: embedIpLimiter,
      keyLimiter: embedKeyLimiter,
    })
      .then(({ status, body }) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(500);
        res.end();
      });
  });

  app.get("/assets/widget-app.js", (_req, res) => {
    serveWidgetAppAsset(widgetAppDistDir)
      .then(({ status, contentType, body }) => {
        res.writeHead(status, { "content-type": contentType });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(500);
        res.end();
      });
  });

  app.get("/assets/fronts/:file", (req, res) => {
    serveCardFrontAsset(deckFrontsDir, req.params.file ?? "")
      .then(({ status, contentType, body }) => {
        res.writeHead(status, { "content-type": contentType });
        res.end(body);
      })
      .catch(() => {
        res.writeHead(500);
        res.end();
      });
  });

  app.get("/loader.js", (_req, res) => {
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
  });
};

const gameServer = createMatchServer({
  httpServer,
  registry,
  auth: { verifier, repository, replayGuard, joinRateLimiter: joinIpLimiter, allowedWidgetOrigins: config.allowedWidgetOrigins },
  rng,
  express: registerCustomRoutes,
  // Same `redis` as every port above: Colyseus's OWN room selection/lookup
  // (`.filterBy(["gameId"])` below, `MatchRoom`'s reconnection-by-roomId)
  // becomes cluster-aware together with our own adapters, never separately
  // — config.ts's own "no partial configuration" docstring.
  redis,
  publicAddress: config.publicAddress,
});
// `gameId` is deliberately absent here — the client supplies it at
// createRoom time, same as `MatchRoom`'s own `defaultOptions` pattern.
// `.filterBy(["gameId"])`: THE SEGREGATION HALF of this unit's fix
// (apply-progress obs 2925/2927, roadmap obs 2943's "PresenceRoom/MatchRoom
// need filterBy before Escoba/Generala ship a second gameId"). Without this,
// colyseus's own matchmaker ignores `gameId` when selecting among already-
// open "presence" rooms for a `joinOrCreate` — a real client asking for game
// B could be handed game A's already-open room. `PresenceRoom.onJoin`'s own
// defense-in-depth check (`presence-room.ts`, this same unit) covers the
// join paths this server-registration mechanism does not (a specific roomId
// targeted directly, bypassing selection entirely).
gameServer.define("presence", PresenceRoom, { registry, pool: presencePool, poolKey: GLOBAL_POOL_KEY } as PresenceRoomCreateOptions).filterBy(["gameId"]);

// gameServer.listen, DELIBERATELY not httpServer.listen — THE SECOND REAL
// BUG this unit found running a genuine browser join, not assumed. Colyseus's
// `Server.listen()` (verified in the installed `@colyseus/core` source) does
// two things beyond starting the socket: `await matchMaker.accept(...)`
// (without it the matchmaker never accepts matchmake requests) and
// `this.bindRoutes()` (without it colyseus's own Express app, sharing this
// httpServer per the previous fix, has NO `/matchmake/*` routes bound at
// all). Calling `httpServer.listen()` directly — this composition root's
// ENTIRE prior history — silently skipped both: every existing test
// exercised rooms via `consumeSeatReservation`/`@colyseus/testing`'s own
// server lifecycle, which never goes through THIS file's listen() call at
// all, so the gap was invisible until a real browser's `joinOrCreate`
// (`watchPresence`/`joinMatchmakingQueue`) needed the HTTP matchmake
// handshake for the first time — it hung with literally zero response,
// forever, rather than erroring.
gameServer.listen(config.port, undefined, undefined, () => {
  console.log(`hexdev-gamify server listening on :${config.port}`);
});
