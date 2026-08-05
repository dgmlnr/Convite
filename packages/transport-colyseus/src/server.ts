import { Server, WebSocketTransport } from "colyseus";
import type { Server as HttpServer } from "node:http";
import type { GameModuleRegistry } from "@hexdev/platform-core";
import type { RandomSource } from "@hexdev/platform-contract";
import { MatchRoom } from "./match-room.js";
import type { MatchRoomAuthOptions, MatchRoomCreateOptions } from "./match-room.js";

export interface MatchServerOptions {
  readonly httpServer: HttpServer;
  readonly registry: GameModuleRegistry;
  readonly auth: MatchRoomAuthOptions;
  readonly rng: RandomSource;
  readonly roomName?: string;
}

/**
 * The ONLY place a composition root (`apps/server`) reaches colyseus's
 * `Server`/`WebSocketTransport` — confines `colyseus` to this one
 * package.json (design §1, `no-colyseus-outside-transport`). The transport
 * shares the CALLER's own `http.Server` so a composition root can also serve
 * plain HTTP routes (`/embed`) from that exact same socket, zero Express.
 * `registry`/`auth`/`rng` become `MatchRoom`'s per-instance DEFAULTS;
 * `gameId`/`config` come from whoever creates/joins a room.
 */
export function createMatchServer(options: MatchServerOptions): Server {
  const gameServer = new Server({ transport: new WebSocketTransport({ server: options.httpServer }) });
  // colyseus types `defaultOptions` as the FULL `onCreate` param, but at
  // runtime merges `merge({}, clientOptions, defaultOptions)` — THIS object
  // wins on collision, so a client can supply `gameId`/`config` but never
  // override `registry`/`auth`/`rng` (verified in `MatchMaker.handleCreateRoom`).
  const defaultOptions = { registry: options.registry, auth: options.auth, rng: options.rng } as MatchRoomCreateOptions;
  gameServer.define(options.roomName ?? "match", MatchRoom, defaultOptions);
  return gameServer;
}
