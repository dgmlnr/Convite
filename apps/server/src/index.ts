import { createServer } from "node:http";
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
  createSessionTokenVerifier,
  createStaticTenantRepository,
} from "@hexdev/platform-core";
import { connectRedis } from "@hexdev/platform-core/node";
import type { ConsultAdviceProvider, JtiReplayGuard, MatchmakingPool, RateLimiter, SystemActionRequester } from "@hexdev/platform-core";
import { PresenceRoom, createMatchServer } from "@hexdev/transport-colyseus";
import type { PresenceRoomCreateOptions } from "@hexdev/transport-colyseus";
import { getConsultAdvice, requestSystemAction, requestSystemAction2v2, trucoModule, trucoModule2v2 } from "@hexdev/truco-module";
import { loadServerConfig } from "./config.js";


// The composition root: wires existing pieces (registry, auth primitives,
// the generic MatchRoom, the deal factory) together. No game rules live
// here — see `truco-module`/`truco-engine` for those.
const config = loadServerConfig(process.env);
const repository = createStaticTenantRepository(config.tenants);
// THIS PROCESS HOLDS NO SEED. That is the mint/verify split (handoff
// §P4.3) actually landed: before it, every replica could mint, so
// compromising any one instance meant minting for the whole fleet. The seed
// now lives only in `apps/mint-server`; this role is given the matching
// PUBLIC half and is structurally incapable of minting — `createSessionTokenVerifier`
// imports a non-extractable, verify-only key and returns an object with no
// `mint` on it at all.
//
// `await` at the top level is deliberate, the same "throw, crash boot"
// convention `connectRedis` below uses: a missing OR malformed
// HEXDEV_SESSION_PUBLIC_KEY throws inside the real Ed25519 key import rather
// than letting the process start and reject every join at runtime.
const verifier = await createSessionTokenVerifier(config.sessionPublicKey);

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
// Rate limiting on room join. The /embed and /session/renew limiters that
// used to sit here left with the front door: they belong to the minting
// role now, which is the process those endpoints actually run in.
const joinIpLimiter: RateLimiter =
  redis !== undefined ? createRedisRateLimiter({ redis, ...config.joinIpRateLimit, keyPrefix: "rl:join-ip" }) : createRateLimiter(config.joinIpRateLimit);
// The registry erases per-module state types (same documented boundary as
// `platform-core/registry.ts` itself); this is that one spot for the pairing.
// `isNonBlockingAction` closes a real, reproduced deadlock (platform-core's
// own `NonBlockingActionClassifier` docstring has the full story): a seña is
// legal continuously, independent of turn, so `MatchRoom` must never treat
// "a bot's ONLY legal action is send-sena" as "this bot must act now" — it
// would starve the actual pending decision forever. Harmless for the 1v1
// entry (send-sena is never offered there at all — señas are teammate-gated
// and a 1v1 team has exactly one player by construction), included on both
// entries for consistency rather than asymmetric registration.
const isTrucoSenaNonBlocking = (action: unknown): boolean => typeof action === "object" && action !== null && (action as { type?: unknown }).type === "send-sena";
// The human answers first. Truco offers a pending call's response to BOTH
// members of the answering team, so a bot partner had it legal at the same
// instant its human teammate did and always won the race — reported from real
// 2v2 play. These two action types are the whole shared surface: opening a
// call is not on the list, because a bot opening its own truco is its own
// decision and not one it is taking away from anybody.
const isTrucoResponseHumanFirst = (action: unknown): boolean => {
  if (typeof action !== "object" || action === null) return false;
  const type = (action as { type?: unknown }).type;
  return type === "respond-truco" || type === "respond-envido";
};
// Asking your partner costs a seña (truco-engine's `consult.ts`), so a bot
// that spends the action is OWED the answer — `MatchRoom` needs to be told
// which action that is, because a bot's question comes back from
// `chooseAction` as an ordinary action with no channel of its own. Only this
// one type: a game that named more here would be handing bots information
// they never paid for.
const isTrucoPaidQuestion = (action: unknown): boolean =>
  typeof action === "object" && action !== null && (action as { type?: unknown }).type === "consult-partner";
const registry = createGameModuleRegistry([
  { module: trucoModule, requestSystemAction: requestSystemAction as SystemActionRequester, isNonBlockingAction: isTrucoSenaNonBlocking, isHumanPriorityAction: isTrucoResponseHumanFirst, getConsultAdvice: getConsultAdvice as ConsultAdviceProvider, isPaidQuestion: isTrucoPaidQuestion },
  // The 2v2 module, additive registration (obs 2927/2925's own named gap):
  // same registry, same generic MatchRoom, a distinct gameId. Nothing above
  // this line changed for the 1v1 entry.
  { module: trucoModule2v2, requestSystemAction: requestSystemAction2v2 as SystemActionRequester, isNonBlockingAction: isTrucoSenaNonBlocking, isHumanPriorityAction: isTrucoResponseHumanFirst, getConsultAdvice: getConsultAdvice as ConsultAdviceProvider, isPaidQuestion: isTrucoPaidQuestion },
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


const gameServer = createMatchServer({
  httpServer,
  registry,
  auth: { verifier, repository, replayGuard, joinRateLimiter: joinIpLimiter, allowedWidgetOrigins: config.allowedWidgetOrigins },
  rng,
  // Same `redis` as every port above: Colyseus's OWN room selection/lookup
  // (`.filterBy(["gameId"])` below, `MatchRoom`'s reconnection-by-roomId)
  // becomes cluster-aware together with our own adapters, never separately
  // — config.ts's own "no partial configuration" docstring.
  redis,
  publicAddress: config.publicAddress,
  // A beat between the last card of a hand and the next deal. Without it the
  // winning card and the hand's own outcome went past in the same broadcast
  // burst that replaced them: "cuando se tira la ultima carta de la ronda no
  // hay tiempo de verla, enseguida desaparece y se vuelve a repartir".
  handEndPauseMs: 1800,
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
// `botFillAfterSeconds` (PR-2b): the degradation timeout for >2-seat queues,
// env-tunable via HEXDEV_QUEUE_BOT_FILL_SECONDS (config.ts, default 30).
gameServer
  .define("presence", PresenceRoom, {
    registry,
    pool: presencePool,
    poolKey: GLOBAL_POOL_KEY,
    botFillAfterSeconds: config.queueBotFillSeconds,
  } as PresenceRoomCreateOptions)
  .filterBy(["gameId"]);

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
  console.log(`convite server listening on :${config.port}`);
});
