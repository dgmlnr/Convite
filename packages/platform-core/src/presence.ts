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
 * The authoritative in-memory waiting collection for one process (design §8:
 * single-process pairing is what makes `tryPair` safely synchronous — a
 * horizontally-scaled deployment would need a shared store instead).
 */
export interface MatchmakingPool {
  join(gameId: GameId, modality: ModalityConfig, player: WaitingPlayer, poolKey?: string): void;
  leave(gameId: GameId, modality: ModalityConfig, connectionId: string, poolKey?: string): void;
  /** DERIVED from the waiting collection's length on every call — never a
   * separately incremented/decremented counter, so it cannot drift. */
  count(gameId: GameId, modality: ModalityConfig, poolKey?: string): number;
  /** Fully synchronous — no `await` anywhere in this function. Single
   * process + single-threaded JS makes this atomic by construction (design
   * §8); this is exactly what breaks first under horizontal scale. */
  tryPair(gameId: GameId, modality: ModalityConfig, poolKey?: string): Pairing | null;
  /** Removes every waiting entry across every queue whose connection the
   * caller reports as no longer alive — the zombie-socket backstop for an
   * `onLeave` a transport never delivered. */
  sweep(isAlive: (connectionId: string) => boolean): void;
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
    join(gameId, modality, player, poolKey = GLOBAL_POOL_KEY) {
      const queue = queueFor(gameId, modality, poolKey);
      if (queue.some((entry) => entry.connectionId === player.connectionId)) return;
      queue.push(player);
    },
    leave(gameId, modality, connectionId, poolKey = GLOBAL_POOL_KEY) {
      const queue = queueFor(gameId, modality, poolKey);
      const index = queue.findIndex((entry) => entry.connectionId === connectionId);
      if (index !== -1) queue.splice(index, 1);
    },
    count: (gameId, modality, poolKey = GLOBAL_POOL_KEY) => queueFor(gameId, modality, poolKey).length,
    tryPair(gameId, modality, poolKey = GLOBAL_POOL_KEY) {
      const queue = queueFor(gameId, modality, poolKey);
      if (queue.length < 2) return null;
      const [a, b] = queue.splice(0, 2);
      return { a: a!, b: b! };
    },
    sweep(isAlive) {
      for (const queue of queues.values()) {
        for (let index = queue.length - 1; index >= 0; index -= 1) {
          if (!isAlive(queue[index]!.connectionId)) queue.splice(index, 1);
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
   * ~10s timer (design §8's zombie-socket sweep). */
  maybeSweep(pool: MatchmakingPool, isAlive: (connectionId: string) => boolean): void;
}

export function createPresenceSweeper(options: PresenceSweeperOptions = {}): PresenceSweeper {
  const clock = options.clock ?? Date.now;
  const intervalMs = options.intervalMs ?? 10_000;
  let lastSweepAt = clock();
  return {
    maybeSweep(pool, isAlive) {
      const now = clock();
      if (now - lastSweepAt < intervalMs) return;
      lastSweepAt = now;
      pool.sweep(isAlive);
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

/**
 * Pure presentation derivation, deliberately NOT wired into any wire
 * protocol broadcast (design §8: "the server always publishes the true
 * count... do not encode UX policy in the wire protocol"). A future UI
 * consumer (widget-app, Phase 7) calls this with the raw counts it receives
 * to apply the zero-counter rule locally.
 */
export function deriveLobbyDisplay(gameId: GameId, configOptions: readonly ConfigOption[], pool: MatchmakingPool, poolKey?: string): readonly LobbyDisplayEntry[] {
  return deriveModalities(configOptions).map((modality) => {
    const count = pool.count(gameId, modality, poolKey);
    return { modality, waitingCount: count === 0 ? undefined : count, promoteBotFallback: count === 0 };
  });
}
