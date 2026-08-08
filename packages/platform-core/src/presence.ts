import type { Clock, ConfigOption, ConfigOptionValue, GameId } from "@hexdev/platform-contract";

/**
 * One concrete combination of a game's `configOptions` values — e.g. truco's
 * `{ pointsToWin: 15 }`. NEVER a fixed field name: derived generically from
 * whatever `configOptions` a `GameModule` declares (roadmap constraint, obs
 * 2943 — the lobby must not hardcode truco's 15/30, or the day Generala
 * arrives someone writes `if (gameId === 'truco')` here).
 */
export type ModalityConfig = Readonly<Record<string, ConfigOptionValue>>;

/** Canonical string key for a modality, stable regardless of property
 * insertion order — two structurally-equal configs always collide to the
 * same waiting queue. */
export function modalityKey(config: ModalityConfig): string {
  return JSON.stringify(
    Object.keys(config)
      .sort()
      .map((key) => [key, config[key]]),
  );
}

/**
 * Every concrete modality a `GameModule` offers: the cartesian product of
 * its `configOptions`' declared values. A module with zero `configOptions`
 * (Generala, per the roadmap) yields exactly one modality, the empty config
 * — the lobby still works for a game with no per-modality queues at all.
 */
export function deriveModalities(configOptions: readonly ConfigOption[]): readonly ModalityConfig[] {
  return configOptions.reduce<ModalityConfig[]>(
    (combinations, option) => combinations.flatMap((combo) => option.values.map((value) => ({ ...combo, [option.key]: value }))),
    [{}],
  );
}

/** Cross-tenant matchmaking is the v1 default (design §8) — every caller
 * that omits `poolKey` shares this exact same queue. */
export const GLOBAL_POOL_KEY = "global";

export interface WaitingPlayer {
  readonly connectionId: string;
  readonly playerId: string;
}

export interface Pairing {
  readonly a: WaitingPlayer;
  readonly b: WaitingPlayer;
}

/**
 * PORT SHAPE, widened for horizontal scaling (design §8 flagged this exact
 * spot: "this is exactly what breaks first under horizontal scale"): every
 * method is `async`. The in-memory adapter below still performs `tryPair`'s
 * queue splice fully synchronously INSIDE the async function body — no
 * `await` between reading the queue and mutating it — so its atomicity
 * guarantee is unchanged, only the calling convention is. A Redis-backed
 * adapter's `tryPair` cannot be synchronous: pairing across processes needs
 * a real network round trip to a Lua script for cross-process atomicity (see
 * `redis-matchmaking-pool.ts`).
 */
export interface MatchmakingPool {
  join(gameId: GameId, modality: ModalityConfig, player: WaitingPlayer, poolKey?: string): Promise<void>;
  leave(gameId: GameId, modality: ModalityConfig, connectionId: string, poolKey?: string): Promise<void>;
  /** DERIVED from the waiting collection's length on every call — never a
   * separately incremented/decremented counter, so it cannot drift. */
  count(gameId: GameId, modality: ModalityConfig, poolKey?: string): Promise<number>;
  /** No `await` between reading the queue and splicing it in the in-memory
   * adapter (design §8) — atomic by construction for that adapter. The
   * Redis adapter achieves the same cross-process atomicity via a Lua
   * script (`EVAL`), which Redis itself runs to completion without
   * interleaving another client's command. */
  tryPair(gameId: GameId, modality: ModalityConfig, poolKey?: string): Promise<Pairing | null>;
  /** Removes every waiting entry across every queue whose connection the
   * caller reports as no longer alive — the zombie-socket backstop for an
   * `onLeave` a transport never delivered. */
  sweep(isAlive: (connectionId: string) => boolean | Promise<boolean>): Promise<void>;
}

export function createMatchmakingPool(): MatchmakingPool {
  const queues = new Map<string, WaitingPlayer[]>();

  function queueFor(gameId: GameId, modality: ModalityConfig, poolKey: string): WaitingPlayer[] {
    const key = `${gameId}:${modalityKey(modality)}:${poolKey}`;
    let queue = queues.get(key);
    if (queue === undefined) {
      queue = [];
      queues.set(key, queue);
    }
    return queue;
  }

  return {
    async join(gameId, modality, player, poolKey = GLOBAL_POOL_KEY) {
      const queue = queueFor(gameId, modality, poolKey);
      if (queue.some((entry) => entry.connectionId === player.connectionId)) return;
      queue.push(player);
    },
    async leave(gameId, modality, connectionId, poolKey = GLOBAL_POOL_KEY) {
      const queue = queueFor(gameId, modality, poolKey);
      const index = queue.findIndex((entry) => entry.connectionId === connectionId);
      if (index !== -1) queue.splice(index, 1);
    },
    count: async (gameId, modality, poolKey = GLOBAL_POOL_KEY) => queueFor(gameId, modality, poolKey).length,
    async tryPair(gameId, modality, poolKey = GLOBAL_POOL_KEY) {
      const queue = queueFor(gameId, modality, poolKey);
      if (queue.length < 2) return null;
      const [a, b] = queue.splice(0, 2);
      return { a: a!, b: b! };
    },
    async sweep(isAlive) {
      for (const queue of queues.values()) {
        for (let index = queue.length - 1; index >= 0; index -= 1) {
          if (!(await isAlive(queue[index]!.connectionId))) queue.splice(index, 1);
        }
      }
    },
  };
}

export interface PresenceSweeperOptions {
  readonly intervalMs?: number;
  readonly clock?: Clock;
}

export interface PresenceSweeper {
  /** No-op unless at least `intervalMs` has elapsed since the last sweep —
   * driven by the injected clock, NEVER `Date.now()` directly inside this
   * logic, so a test advances a fake clock instead of waiting on a real
   * ~10s timer (design §8's zombie-socket sweep). `async` to match
   * `MatchmakingPool.sweep`'s own widened, horizontal-scaling-ready shape. */
  maybeSweep(pool: MatchmakingPool, isAlive: (connectionId: string) => boolean | Promise<boolean>): Promise<void>;
}

export function createPresenceSweeper(options: PresenceSweeperOptions = {}): PresenceSweeper {
  const clock = options.clock ?? Date.now;
  const intervalMs = options.intervalMs ?? 10_000;
  let lastSweepAt = clock();
  return {
    async maybeSweep(pool, isAlive) {
      const now = clock();
      if (now - lastSweepAt < intervalMs) return;
      lastSweepAt = now;
      await pool.sweep(isAlive);
    },
  };
}

/** One modality's presentation state for a selection screen. */
export interface LobbyDisplayEntry {
  readonly modality: ModalityConfig;
  /** `undefined` exactly when the zero-counter UX rule applies (obs 2919: a
   * decided product rule, not a suggestion) — the UI MUST NOT render
   * "0 players waiting"; it promotes the bot option instead. */
  readonly waitingCount: number | undefined;
  readonly promoteBotFallback: boolean;
}

/** Raw per-modality count, exactly the shape `PresenceRoom.broadcastCounts`
 * already sends over the wire (design §8: the wire protocol carries the true
 * count, including zero — UX policy is applied by a consumer, never encoded
 * on the wire itself). */
export interface RawModalityCount {
  readonly modality: ModalityConfig;
  readonly waitingCount: number;
}

/**
 * The zero-counter UX rule (spec: "Zero-Counter UX Rule"), as a single
 * source of truth applicable to EITHER a server-side `MatchmakingPool` read
 * (`deriveLobbyDisplay` below, used by the polled `/presence` HTTP snapshot)
 * OR a live WebSocket `"counts"` broadcast a client only ever receives as
 * raw `{modality, waitingCount}[]` JSON, never a `MatchmakingPool` instance
 * (`@hexdev/transport-colyseus-client`'s presence connection). Extracting
 * this keeps the rule encoded exactly once, per its own prior docstring's
 * instruction not to re-decide it per consumer.
 */
export function deriveLobbyDisplayFromCounts(counts: readonly RawModalityCount[]): readonly LobbyDisplayEntry[] {
  return counts.map(({ modality, waitingCount }) => ({
    modality,
    waitingCount: waitingCount === 0 ? undefined : waitingCount,
    promoteBotFallback: waitingCount === 0,
  }));
}

/**
 * Pure presentation derivation, deliberately NOT wired into any wire
 * protocol broadcast (design §8: "the server always publishes the true
 * count... do not encode UX policy in the wire protocol"). A future UI
 * consumer (widget-app, Phase 7) calls this with the raw counts it receives
 * to apply the zero-counter rule locally.
 */
export async function deriveLobbyDisplay(
  gameId: GameId,
  configOptions: readonly ConfigOption[],
  pool: MatchmakingPool,
  poolKey?: string,
): Promise<readonly LobbyDisplayEntry[]> {
  const counts = await Promise.all(
    deriveModalities(configOptions).map(async (modality) => ({ modality, waitingCount: await pool.count(gameId, modality, poolKey) })),
  );
  return deriveLobbyDisplayFromCounts(counts);
}
