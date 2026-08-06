import { Room, matchMaker, type Client } from "colyseus";
import type { GameId } from "@hexdev/platform-contract";
import type { GameModuleRegistry, MatchmakingPool, ModalityConfig, Pairing, PresenceSweeper } from "@hexdev/platform-core";
import { createPresenceSweeper, deriveModalities } from "@hexdev/platform-core";

export interface PresenceRoomCreateOptions {
  readonly gameId: GameId;
  readonly registry: GameModuleRegistry;
  readonly pool: MatchmakingPool;
  /** Cross-tenant by default (`GLOBAL_POOL_KEY` in `MatchmakingPool` if
   * omitted) — a per-tenant deployment passes the tenant id here, a config
   * value, never a redesign (design §8). */
  readonly poolKey?: string;
  readonly sweeper?: PresenceSweeper;
  readonly sweepTickMs?: number;
  /** The Colyseus room name a pairing is handed off into — the SAME name
   * `createMatchServer` registers `MatchRoom` under (default `"match"`).
   * A config value only: `PresenceRoom` never imports `MatchRoom`, keeping
   * the lobby ignorant of any specific game-room implementation. */
  readonly matchRoomName?: string;
}

interface PresenceJoinOptions {
  readonly modality: ModalityConfig;
  readonly playerId: string;
  /** The player's own session token (design §7), forwarded UNVALIDATED into
   * the eventual `MatchRoom` seat reservation so `MatchRoom.onAuth` — not
   * this room — stays the ONLY place identity is ever verified (signature,
   * origin, entitlement, replay). `PresenceRoom` still performs NO join-time
   * auth of its own (unchanged v1 scope boundary, obs 2927): this field is
   * custodied, never inspected, never trusted for anything presence-side. */
  readonly token?: string;
}

interface WaitingClient {
  readonly client: Client;
  readonly modality: ModalityConfig;
  readonly playerId: string;
  readonly token: string | undefined;
}

/** One seat of a formed pairing, paired with the `WaitingClient` (if still
 * tracked) that is about to be handed off into the match room. */
interface PairedSeat {
  readonly playerId: string;
  readonly entry: WaitingClient | undefined;
}

/**
 * The lobby presence channel (design §8), separate from any `MatchRoom` —
 * clients here are waiting for a match, not playing one. Holds zero
 * game-specific knowledge: every modality is derived from
 * `registry.get(gameId).configOptions`, the SAME generic mechanism a
 * `GameModule` already exposes for truco's point target. Nothing in this
 * file reads a modality field by name (roadmap constraint, obs 2943).
 *
 * Deliberately no join-time auth (unlike `MatchRoom`): this room reveals
 * only aggregate counts and pairs anonymous connections, never game state.
 */
export class PresenceRoom extends Room {
  private gameId: GameId | undefined;
  private registry: GameModuleRegistry | undefined;
  private pool: MatchmakingPool | undefined;
  private poolKey: string | undefined;
  private sweeper: PresenceSweeper | undefined;
  private matchRoomName = "match";
  private readonly waiting = new Map<string, WaitingClient>();

  override onCreate(options: PresenceRoomCreateOptions): void {
    if (options.registry.get(options.gameId) === undefined) {
      throw new Error(`PresenceRoom: no GameModule registered for gameId "${options.gameId}"`);
    }
    this.gameId = options.gameId;
    this.registry = options.registry;
    this.pool = options.pool;
    this.poolKey = options.poolKey;
    this.matchRoomName = options.matchRoomName ?? "match";
    this.sweeper = options.sweeper ?? createPresenceSweeper();
    // Counters do not need 20Hz sync (design §8).
    this.setPatchRate(1000);
    this.clock.setInterval(() => this.sweepZombies(), options.sweepTickMs ?? 1000);
  }

  override async onJoin(client: Client, options: PresenceJoinOptions): Promise<void> {
    const pool = this.pool;
    const gameId = this.gameId;
    if (pool === undefined || gameId === undefined) return;
    pool.join(gameId, options.modality, { connectionId: client.sessionId, playerId: options.playerId }, this.poolKey);
    this.waiting.set(client.sessionId, { client, modality: options.modality, playerId: options.playerId, token: options.token });
    this.broadcastCounts();
    await this.tryPair(options.modality);
  }

  override onLeave(client: Client): void {
    const entry = this.waiting.get(client.sessionId);
    const pool = this.pool;
    const gameId = this.gameId;
    if (entry === undefined || pool === undefined || gameId === undefined) return;
    pool.leave(gameId, entry.modality, client.sessionId, this.poolKey);
    this.waiting.delete(client.sessionId);
    this.broadcastCounts();
  }

  /**
   * On a formed pairing: remove both from the queue (unchanged, exactly
   * once — `MatchmakingPool.tryPair` splices atomically), THEN hand off into
   * a real `MatchRoom` via Colyseus's own seat-reservation mechanism
   * (`matchMaker.createRoom` + `matchMaker.reserveSeatFor`), never a second,
   * lighter identity path: each reservation carries only the player's own
   * token, UNVALIDATED here, so `MatchRoom.onAuth` alone still decides
   * whether the eventual live join is accepted. Reserving BOTH seats before
   * either client even receives the `paired` message also closes the seat-
   * theft window a naive "tell them the roomId, let them self-join" hand-off
   * would leave open: `MatchRoom.hasReachedMaxClients()` counts reserved
   * seats too, so a third client can never join in between.
   */
  private async tryPair(modality: ModalityConfig): Promise<void> {
    const pool = this.pool;
    const gameId = this.gameId;
    if (pool === undefined || gameId === undefined) return;
    const pairing: Pairing | null = pool.tryPair(gameId, modality, this.poolKey);
    if (pairing === null) return;
    const seats: readonly PairedSeat[] = [pairing.a, pairing.b].map((player) => {
      const entry = this.waiting.get(player.connectionId);
      this.waiting.delete(player.connectionId);
      return { playerId: player.playerId, entry };
    });
    this.broadcastCounts();
    await this.handOffToMatch(gameId, modality, seats);
  }

  private async handOffToMatch(gameId: GameId, modality: ModalityConfig, seats: readonly PairedSeat[]): Promise<void> {
    let room: Awaited<ReturnType<typeof matchMaker.createRoom>>;
    try {
      room = await matchMaker.createRoom(this.matchRoomName, { gameId, config: modality });
    } catch (error) {
      this.notifyHandoffFailure(seats, error);
      return;
    }
    await Promise.all(
      seats.map(async ({ entry }, index) => {
        if (entry === undefined) return;
        const opponent = seats[index === 0 ? 1 : 0]!;
        try {
          const matchReservation = await matchMaker.reserveSeatFor(room, { token: entry.token });
          entry.client.send("paired", { opponentPlayerId: opponent.playerId, modality, matchReservation });
        } catch (error) {
          this.notifyHandoffFailure([{ playerId: opponent.playerId, entry }], error);
        }
      }),
    );
  }

  private notifyHandoffFailure(seats: readonly PairedSeat[], error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    for (const { entry } of seats) entry?.client.send("pairing-failed", { message });
  }

  /** Backstop for an `onLeave` a transport never delivered (design §8): a
   * connectionId this room is NOT tracking is never touched, so this only
   * ever affects entries owned by THIS presence channel, never another
   * game's queue sharing the same `pool` instance. */
  private sweepZombies(): void {
    const pool = this.pool;
    const sweeper = this.sweeper;
    if (pool === undefined || sweeper === undefined) return;
    sweeper.maybeSweep(pool, (connectionId) => {
      if (!this.waiting.has(connectionId)) return true;
      const alive = this.clients.some((seated) => seated.sessionId === connectionId);
      if (!alive) this.waiting.delete(connectionId);
      return alive;
    });
    this.broadcastCounts();
  }

  private broadcastCounts(): void {
    const gameId = this.gameId;
    const module = gameId !== undefined ? this.registry?.get(gameId) : undefined;
    const pool = this.pool;
    if (gameId === undefined || module === undefined || pool === undefined) return;
    const counts = deriveModalities(module.configOptions).map((modality) => ({ modality, waitingCount: pool.count(gameId, modality, this.poolKey) }));
    this.broadcast("counts", counts);
  }
}
