import { createServer } from "node:http";
import type { RandomSource } from "@hexdev/platform-contract";
import { createGameModuleRegistry, createJtiReplayGuard, createRateLimiter, createSessionTokenIssuer, createStaticTenantRepository } from "@hexdev/platform-core";
import type { SystemActionRequester } from "@hexdev/platform-core";
import { createMatchServer } from "@hexdev/transport-colyseus";
import { requestSystemAction, trucoModule } from "@hexdev/truco-module";
import { loadServerConfig } from "./config.js";
import { handleEmbedRequest } from "./embed-handler.js";

// The composition root: wires existing pieces (registry, auth primitives,
// the generic MatchRoom, the deal factory) together. No game rules live
// here — see `truco-module`/`truco-engine` for those.
const config = loadServerConfig(process.env);
const repository = createStaticTenantRepository(config.tenants);
const issuer = createSessionTokenIssuer(config.sessionSecret);
const replayGuard = createJtiReplayGuard();
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

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname === "/embed") {
    handleEmbedRequest(url, req.headers.origin, req.socket.remoteAddress, {
      repository,
      issuer,
      ttlSeconds: config.sessionTtlSeconds,
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
    return;
  }
  res.writeHead(404);
  res.end();
});

createMatchServer({ httpServer, registry, auth: { issuer, repository, replayGuard, joinRateLimiter: joinIpLimiter }, rng });

httpServer.listen(config.port, () => {
  console.log(`hexdev-gamify server listening on :${config.port}`);
});
