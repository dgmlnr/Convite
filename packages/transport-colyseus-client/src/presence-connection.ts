import type { GameId, PlayerId } from "@hexdev/platform-contract";
import type { LobbyDisplayEntry, ModalityConfig, RawModalityCount } from "@hexdev/platform-core";
import { deriveLobbyDisplayFromCounts } from "@hexdev/platform-core";
import type { ClientLike, Unsubscribe } from "./ports.js";

/** The Colyseus room name registered server-side (`apps/server`'s
 * `gameServer.define("presence", PresenceRoom, ...)`) — a config value owned
 * by this one file, never repeated at each call site. */
const PRESENCE_ROOM_NAME = "presence";

export interface WatchPresenceOptions {
  readonly gameId: GameId;
  readonly playerId: string;
  readonly token?: string;
}

export interface PresenceConnection {
  /** Fires on every "counts" broadcast (design §8: the server always
   * publishes the true count for every modality of this room's `gameId`),
   * already mapped through the single-source-of-truth zero-counter rule. */
  onCounts(callback: (display: readonly LobbyDisplayEntry[]) => void): Unsubscribe;
  leave(): Promise<void>;
}

/**
 * Watch-only: joins `PresenceRoom` with NO `modality` field, the exact shape
 * `PresenceRoom.onJoin` (transport-colyseus, this unit's companion fix)
 * treats as "never enqueue, never pair, just receive broadcasts" — the
 * selection screen needs live counts for EVERY modality of a game before a
 * player has committed to any single one, and the room's own join contract
 * previously had no way to express that without also enqueueing.
 */
export async function watchPresence(client: ClientLike, options: WatchPresenceOptions): Promise<PresenceConnection> {
  // joinOrCreate, deliberately NOT join: no PresenceRoom instance exists
  // for a gameId until the FIRST client shows up for it — `client.join`
  // requires an ALREADY-EXISTING room and rejects with "no rooms found"
  // otherwise (found running this live, not assumed). CLOSED (apply-progress
  // obs 2925/2927, `transport-colyseus` scope, per this file's own prior
  // disclosure): `gameServer.define("presence", PresenceRoom, ...)` now
  // registers `.filterBy(["gameId"])` — a SECOND game's watcher can no longer
  // be handed a FIRST game's already-open room. `PresenceRoom.onJoin` also
  // now defensively rejects a join whose claimed `gameId` disagrees with the
  // room's own, even for a path that bypasses `filterBy` selection entirely
  // (a hand-crafted join, a stale client). This call site's `gameId` field
  // was ALWAYS sent on the wire; it is what both layers of that fix consume.
  const room = await client.joinOrCreate(PRESENCE_ROOM_NAME, { gameId: options.gameId, playerId: options.playerId, token: options.token });
  return {
    onCounts(callback) {
      return room.onMessage<readonly RawModalityCount[]>("counts", (counts) => callback(deriveLobbyDisplayFromCounts(counts)));
    },
    leave: () => room.leave(false).then(() => undefined), // consented:false — same fast-teardown default as match-connection.ts (PresenceRoom has no slow custom onLeave today, but the explicit default keeps this call site correct if that ever changes rather than relying on incidental behavior).
  };
}

export interface JoinMatchmakingQueueOptions extends WatchPresenceOptions {
  readonly modality: ModalityConfig;
}

/** One formed match group (spec: "Human-vs-Human Matchmaking"; PR-2a
 * generalized this from a 2-player pairing to the game's full `seatCount`).
 * `players` is the ENTIRE roster in formation order — every member of the
 * group INCLUDING this client itself — because the server broadcasts one
 * shared fact to all members rather than a per-recipient "opponent" view
 * (an "opponent" stops being well-defined once teammates exist, e.g. 2v2).
 * `reservation` is deliberately `unknown` here too — only
 * `match-connection.ts`'s `joinMatchFromReservation` knows what to do with
 * it (`ports.ts`'s division of labor: this package routes it,
 * `@colyseus/sdk` interprets it). */
export interface PairedMatch {
  readonly players: readonly PlayerId[];
  readonly modality: ModalityConfig;
  readonly reservation: unknown;
}

export interface MatchmakingQueueConnection {
  onPaired(callback: (pairing: PairedMatch) => void): Unsubscribe;
  onPairingFailed(callback: (message: string) => void): Unsubscribe;
  leave(): Promise<void>;
}

interface PairedMessage {
  readonly players: readonly string[];
  readonly modality: ModalityConfig;
  readonly matchReservation: unknown;
}

/**
 * Real queue commitment: joins WITH a `modality`, the shape `PresenceRoom`
 * enqueues and eventually pairs. Distinct from `watchPresence` above — never
 * the same join call, since a client can only occupy one branch of
 * `PresenceRoom.onJoin` per connection (spec: "Player-Chosen Point Target" —
 * the player has already chosen by the time this is called).
 */
export async function joinMatchmakingQueue(client: ClientLike, options: JoinMatchmakingQueueOptions): Promise<MatchmakingQueueConnection> {
  // joinOrCreate for the same reason as watchPresence above — see that
  // function's comment for the full explanation; the filterBy gap it
  // describes is now closed and covers this call site identically.
  const room = await client.joinOrCreate(PRESENCE_ROOM_NAME, {
    gameId: options.gameId,
    playerId: options.playerId,
    modality: options.modality,
    token: options.token,
  });
  return {
    onPaired(callback) {
      return room.onMessage<PairedMessage>("paired", (message) =>
        callback({ players: message.players as readonly PlayerId[], modality: message.modality, reservation: message.matchReservation }),
      );
    },
    onPairingFailed(callback) {
      return room.onMessage<{ message: string }>("pairing-failed", (payload) => callback(payload.message));
    },
    leave: () => room.leave(false).then(() => undefined), // consented:false — same fast-teardown default as match-connection.ts (PresenceRoom has no slow custom onLeave today, but the explicit default keeps this call site correct if that ever changes rather than relying on incidental behavior).
  };
}
