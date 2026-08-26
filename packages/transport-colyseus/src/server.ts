import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { Server as HttpServer } from "node:http";
import type { Redis } from "ioredis";
import { RedisDriver } from "@colyseus/redis-driver";
import { RedisPresence } from "@colyseus/redis-presence";
import type { GameModuleRegistry } from "@hexdev/platform-core";
import type { RandomSource } from "@hexdev/platform-contract";
import { MatchRoom } from "./match-room.js";
import type { MatchRoomAuthOptions, MatchRoomCreateOptions } from "./match-room.js";

/** Extracted from `Server`'s OWN constructor options rather than declaring a
 * new `express` dependency in this package.json: TypeScript resolves the
 * nested `import type express from 'express'` inside `@colyseus/core`'s own
 * `.d.ts` from THAT package's own module scope, not this consumer's —
 * standard TS behavior, verified by this file typechecking with no new
 * dependency edge. */
export type ExpressAppCallback = NonNullable<NonNullable<ConstructorParameters<typeof Server>[0]>["express"]>;

export interface MatchServerOptions {
  readonly httpServer: HttpServer;
  readonly registry: GameModuleRegistry;
  readonly auth: MatchRoomAuthOptions;
  readonly rng: RandomSource;
  readonly roomName?: string;
  /**
   * A composition root's own custom HTTP routes (`/embed`, `/loader.js`),
   * added onto colyseus's OWN Express app rather than as a second, separate
   * `http.Server` `request` listener. THE REAL BUG this closes, found
   * running a genuine browser join, not assumed: two independent plain
   * `server.on("request", ...)` listeners sharing one socket both try to
   * respond to the SAME request — colyseus's own matchmake routes need
   * `Server.listen()`'s `bindRoutes()` to exist at all, and once they do,
   * a second unrelated listener racing to also respond crashes with
   * `ERR_HTTP_HEADERS_SENT`. `Server`'s own `express` option (its
   * constructor, verified in the installed `.d.ts`'s documented example)
   * registers everything on ONE Express app with normal route-matching
   * semantics — no race, no double-response.
   */
  readonly express?: ExpressAppCallback;
  /**
   * Horizontal scaling (apply prompt: "a half-migrated deployment where our
   * pools are shared but Colyseus's are not is arguably worse than
   * neither"). Undefined (default) keeps Colyseus on its own built-in
   * `LocalPresence`/`LocalDriver` — a room created on one process is
   * invisible to another process's matchmaker, exactly matching this
   * repo's own `MatchmakingPool`/`RateLimiter`/`JtiReplayGuard` staying
   * in-memory by default. Set (the composition root's ONE
   * `HEXDEV_REDIS_URL` knob, `apps/server/src/config.ts`) switches
   * Colyseus itself to `RedisPresence`/`RedisDriver`, sharing the SAME
   * already-connected ioredis client this package's caller also hands to
   * every other Redis-backed adapter — one Redis client library
   * (`ioredis`, matching `@colyseus/redis-presence`/`@colyseus/redis-
   * driver`'s own dependency) per process, never two.
   */
  readonly redis?: Redis;
  /**
   * This process's OWN reachable host:port (e.g. `127.0.0.1:2568`),
   * forwarded verbatim into Colyseus's own `publicAddress` option.
   * Meaningless without `redis`/`RedisDriver` — Colyseus records it on a
   * room's own metadata at creation time and returns it in the seat
   * reservation, which is what lets a client whose `joinOrCreate` HTTP
   * request landed on THIS process's matchmake endpoint open its actual
   * WebSocket against a DIFFERENT process's socket, when the driver
   * discovers the target room lives there instead (verified in the
   * installed `@colyseus/core` source: `MatchMaker.createRoom` records
   * `publicAddress` on the room, and `reserveSeatFor` copies it onto the
   * reservation only when set). Undefined (default, single-instance/dev)
   * relies on the client reusing the SAME address it already used for the
   * matchmake call — correct there, but silently wrong the moment two
   * processes are involved, which is exactly why a horizontal-scaling
   * deployment must set this per instance (real address, or a stable
   * per-instance hostname behind a WS-aware load balancer).
   */
  readonly publicAddress?: string;
  /** See `MatchRoomCreateOptions.handEndPauseMs`. Set by the composition
   * root; every test that builds a room directly leaves it unset and pays
   * nothing. */
  readonly handEndPauseMs?: number;
}

/**
 * The ONLY place a composition root (`apps/server`) reaches colyseus's
 * `Server`/`WebSocketTransport` — confines `colyseus` to this one
 * package.json (design §1, `no-colyseus-outside-transport`). The transport
 * shares the CALLER's own `http.Server` so a composition root can also serve
 * plain HTTP routes (`/embed`) from that exact same socket, via the
 * `express` option above rather than a second racing request listener.
 * `registry`/`auth`/`rng` become `MatchRoom`'s per-instance DEFAULTS;
 * `gameId`/`config` come from whoever creates/joins a room.
 */
export function createMatchServer(options: MatchServerOptions): Server {
  // Both constructed from the SAME `Redis` instance when provided:
  // `RedisPresence` internally `.duplicate()`s it for its own subscriber
  // connection (verified in the installed `@colyseus/redis-presence`
  // source) — this package never opens a connection of its own the caller
  // did not already establish and verify (composition root's own boot-time
  // fail-loud check, `apps/server/src/redis-client.ts`).
  const presence = options.redis !== undefined ? new RedisPresence(options.redis) : undefined;
  const driver = options.redis !== undefined ? new RedisDriver(options.redis) : undefined;
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: options.httpServer }),
    express: options.express,
    presence,
    driver,
    publicAddress: options.publicAddress,
  });
  // colyseus types `defaultOptions` as the FULL `onCreate` param, but at
  // runtime merges `merge({}, clientOptions, defaultOptions)` — THIS object
  // wins on collision, so a client can supply `gameId`/`config` but never
  // override `registry`/`auth`/`rng` (verified in `MatchMaker.handleCreateRoom`).
  const defaultOptions = { registry: options.registry, auth: options.auth, rng: options.rng, handEndPauseMs: options.handEndPauseMs } as MatchRoomCreateOptions;
  gameServer.define(options.roomName ?? "match", MatchRoom, defaultOptions);
  return gameServer;
}
