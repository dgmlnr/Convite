import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createRateLimiter, createRedisRateLimiter, createSessionTokenIssuer, createStaticTenantRepository } from "@hexdev/platform-core";
import { connectRedis } from "@hexdev/platform-core/node";
import type { RateLimiter } from "@hexdev/platform-core";
import {
  handleEmbedRequest,
  handleSessionRenewRequest,
  refererOrigin,
  renderEmbedShell,
  serveCardFrontAsset,
  serveLoaderAsset,
  serveTileFrontAsset,
  serveWidgetAppAsset,
  type EmbedBootstrap,
} from "@hexdev/widget-frontdoor";
import { loadMintConfig } from "./config.js";
import { buildMintGameRegistry } from "./registry.js";
import { prefersHtml, resolveRoute } from "./routing.js";

/**
 * The MINTING role's composition root.
 *
 * WHAT IT IS FOR. This is the only process in the fleet that holds the
 * Ed25519 seed. Splitting it out is what closes the debt recorded in handoff
 * §P4.3 — "compromise any one instance and you mint for the whole fleet" —
 * because after the split a match-serving replica has neither the seed nor
 * the code that uses it.
 *
 * WHY IT OWNS MORE THAN TWO ROUTES. `/embed` does not merely mint: it renders
 * the widget's own HTML shell with the token inlined, and the widget then
 * calls `/session/renew` at a RELATIVE url whose origin is checked against
 * this deployment's own widget origins. So the mint role has to serve the
 * whole front door — the embed page, the renewal, the loader and the widget
 * bundle — and it has to sit behind the SAME public origin as the match role,
 * reached by path routing rather than by a hostname of its own. Anything less
 * and the renewal's origin check cannot pass.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never runs a room, never touches
 * colyseus, and holds no verifier: verification belongs to the match role,
 * which after the split boots from a public key alone. The
 * `no-colyseus-outside-transport` boundary rule enforces the first half
 * mechanically.
 *
 * STATUS: this app is additive. Nothing routes to it yet, and
 * `apps/server` still serves these same paths exactly as before — the
 * changeover, and the match role dropping its seed, is the next unit.
 */
const config = loadMintConfig(process.env);
const repository = createStaticTenantRepository(config.tenants);
// `await` here is deliberate, the same "throw, crash boot" convention the
// match role uses for its own key material: a missing OR malformed
// HEXDEV_SESSION_SIGNING_KEY throws INSIDE createSessionTokenIssuer, never
// silently falling back to an ephemeral key. An ephemeral key would
// invalidate every live session on restart and, worse, differ per replica of
// this role — quietly re-breaking the fleet-wide consistency the EdDSA move
// exists to guarantee.
const issuer = await createSessionTokenIssuer(config.sessionSigningKey);
const redis = config.redisUrl !== undefined ? await connectRedis(config.redisUrl) : undefined;

// Both limiters flip together with the one knob, never one alone — the same
// "no partial configuration" rule the match role's own config documents.
const embedIpLimiter: RateLimiter =
  redis !== undefined ? createRedisRateLimiter({ redis, ...config.embedIpRateLimit, keyPrefix: "rl:embed-ip" }) : createRateLimiter(config.embedIpRateLimit);
const embedKeyLimiter: RateLimiter =
  redis !== undefined ? createRedisRateLimiter({ redis, ...config.embedKeyRateLimit, keyPrefix: "rl:embed-key" }) : createRateLimiter(config.embedKeyRateLimit);

// The registrations themselves live in `registry.ts` — see that function's
// own docstring for why they had to leave this file to be testable at all.
const registry = buildMintGameRegistry();

// `apps/mint-server/dist/index.js` -> the same targets the match role
// resolves, at the same relative depth because both are `apps/<name>/dist`.
const widgetAppDistDir = fileURLToPath(new URL("../../widget-app/dist-app", import.meta.url));
const widgetSdkDistDir = fileURLToPath(new URL("../../../packages/widget-sdk/dist-iife", import.meta.url));
const deckFrontsDir = fileURLToPath(new URL("../../../packages/spanish-deck-ui/assets/fronts", import.meta.url));
// Its own directory, its own artwork, its own license (CC BY-SA 4.0 rather
// than the deck's 3.0) — see packages/mahjong-tile-ui/assets/LICENSE.
const tileFrontsDir = fileURLToPath(new URL("../../../packages/mahjong-tile-ui/assets/tiles", import.meta.url));

/* c8 ignore start — the HTTP plumbing; `resolveRoute` and `loadMintConfig` are what the tests pin. */
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  // A plain GET navigation to a cross-origin URL — exactly what the loader
  // does when it sets the sandboxed iframe's src — carries NO Origin header
  // at all. Referer does, trimmed to the origin by the default
  // strict-origin-when-cross-origin policy, and that fallback is what makes
  // the allowlist check reachable by a real browser.
  const origin = req.headers.origin ?? refererOrigin(req.headers.referer);
  const route = resolveRoute(req.method ?? "GET", url.pathname);

  const fail = (): void => {
    res.writeHead(500);
    res.end();
  };

  switch (route.kind) {
    case "embed":
      handleEmbedRequest(url, origin, req.socket.remoteAddress, {
        repository,
        issuer,
        ttlSeconds: config.sessionTtlSeconds,
        ipLimiter: embedIpLimiter,
        keyLimiter: embedKeyLimiter,
        registry,
      })
        .then(({ status, body }) => {
          // Content negotiation on ONE path: a real browser navigating the
          // iframe's src sends `Accept: text/html` and gets the shell with
          // the mint result INLINED, because a same-origin fetch from inside
          // the iframe back here would carry no origin evidence at all. A
          // programmatic caller asking for JSON still gets the plain API.
          if (prefersHtml(req.headers.accept)) {
            const bootstrap: EmbedBootstrap | undefined = status === 200 ? (JSON.parse(body) as EmbedBootstrap) : undefined;
            res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
            res.end(renderEmbedShell(bootstrap));
            return;
          }
          res.writeHead(status, { "content-type": "application/json" });
          res.end(body);
        })
        .catch(fail);
      return;

    case "session-renew":
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
        .catch(fail);
      return;

    case "loader":
      serveLoaderAsset(widgetSdkDistDir)
        .then(({ status, contentType, body, cacheControl }) => {
          res.writeHead(status, cacheControl ? { "content-type": contentType, "cache-control": cacheControl } : { "content-type": contentType });
          res.end(body);
        })
        .catch(fail);
      return;

    case "widget-app":
      serveWidgetAppAsset(widgetAppDistDir)
        .then(({ status, contentType, body, cacheControl }) => {
          res.writeHead(status, cacheControl ? { "content-type": contentType, "cache-control": cacheControl } : { "content-type": contentType });
          res.end(body);
        })
        .catch(fail);
      return;

    case "card-front":
      serveCardFrontAsset(deckFrontsDir, route.file)
        .then(({ status, contentType, body }) => {
          res.writeHead(status, { "content-type": contentType });
          res.end(body);
        })
        .catch(fail);
      return;

    case "tile-front":
      serveTileFrontAsset(tileFrontsDir, route.file)
        .then(({ status, contentType, body }) => {
          res.writeHead(status, { "content-type": contentType });
          res.end(body);
        })
        .catch(fail);
      return;

    default:
      res.writeHead(404);
      res.end();
  }
});

server.listen(config.port, () => {
  console.log(`convite mint role listening on :${String(config.port)}`);
});
/* c8 ignore stop */
