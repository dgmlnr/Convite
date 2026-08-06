import { Server, WebSocketTransport } from "colyseus";
import type { Server as HttpServer } from "node:http";
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
  const gameServer = new Server({ transport: new WebSocketTransport({ server: options.httpServer }), express: options.express });
  // colyseus types `defaultOptions` as the FULL `onCreate` param, but at
  // runtime merges `merge({}, clientOptions, defaultOptions)` — THIS object
  // wins on collision, so a client can supply `gameId`/`config` but never
  // override `registry`/`auth`/`rng` (verified in `MatchMaker.handleCreateRoom`).
  const defaultOptions = { registry: options.registry, auth: options.auth, rng: options.rng } as MatchRoomCreateOptions;
  gameServer.define(options.roomName ?? "match", MatchRoom, defaultOptions);
  return gameServer;
}
