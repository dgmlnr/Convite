import { Room, type Client } from "colyseus";
import type { GameId } from "@hexdev/platform-contract";
import type { GameModuleRegistry, MatchmakingPool, ModalityConfig, PresenceSweeper } from "@hexdev/platform-core";
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
}

interface PresenceJoinOptions {
  readonly modality: ModalityConfig;
  readonly playerId: string;
}

interface WaitingClient {
  readonly client: Client;
  readonly modality: ModalityConfig;
  readonly playerId: string;
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
  private readonly waiting = new Map<string, WaitingClient>();

  override onCreate(options: PresenceRoomCreateOptions): void {
    if (options.registry.get(options.gameId) === undefined) {
      throw new Error(`PresenceRoom: no GameModule registered for gameId "${options.gameId}"`);
    }
    this.gameId = options.gameId;
    this.registry = options.registry;
    this.pool = options.pool;
    this.poolKey = options.poolKey;
    this.sweeper = options.sweeper ?? createPresenceSweeper();
    // Counters do not need 20Hz sync (design §8).
    this.setPatchRate(1000);
    this.clock.setInterval(() => this.sweepZombies(), options.sweepTickMs ?? 1000);
  }

  override onJoin(client: Client, options: PresenceJoinOptions): void {
    const pool = this.pool;
    const gameId = this.gameId;
    if (pool === undefined || gameId === undefined) return;
    pool.join(gameId, options.modality, { connectionId: client.sessionId, playerId: options.playerId }, this.poolKey);
    this.waiting.set(client.sessionId, { client, modality: options.modality, playerId: options.playerId });
    this.broadcastCounts();
    this.tryPair(options.modality);
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

  private tryPair(modality: ModalityConfig): void {
    const pool = this.pool;
    const gameId = this.gameId;
    if (pool === undefined || gameId === undefined) return;
    const pairing = pool.tryPair(gameId, modality, this.poolKey);
    if (pairing === null) return;
    for (const [self, other] of [
      [pairing.a, pairing.b],
      [pairing.b, pairing.a],
    ] as const) {
      const entry = this.waiting.get(self.connectionId);
      this.waiting.delete(self.connectionId);
      entry?.client.send("paired", { opponentPlayerId: other.playerId, modality });
    }
    this.broadcastCounts();
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
