import { Redis } from "ioredis";

/**
 * Constructs and CONNECTS the one shared ioredis client this process uses
 * for every Redis-backed adapter (`RateLimiter` x3, `JtiReplayGuard`,
 * `MatchmakingPool`) AND Colyseus's own `RedisPresence`/`RedisDriver`
 * (`createMatchServer`'s `redis` option) — one client library, one
 * connection, per `config.ts`'s own docstring on `redisUrl`.
 *
 * FAIL LOUD AT BOOT (apply prompt: "a misconfigured Redis must fail loudly
 * at boot, never silently fall back to in-memory in production"). ioredis's
 * DEFAULT `retryStrategy` retries an unreachable host FOREVER with capped
 * backoff — that is silent, not loud: boot would just hang, never crash,
 * never fall back, giving no operator signal at all. A bounded
 * `retryStrategy` (gives up after a handful of attempts) plus `lazyConnect:
 * true` and an explicit `await redis.connect()` turns that hang into a
 * genuine rejection this function re-throws, crashing the process before
 * `gameServer.listen()` — the same "throw, never silently continue"
 * convention `config.ts`'s own `HEXDEV_SESSION_SECRET` guard already
 * established for a different misconfiguration.
 */
const MAX_CONNECT_ATTEMPTS = 5;

export async function connectRedis(url: string): Promise<Redis> {
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (attempt) => (attempt > MAX_CONNECT_ATTEMPTS ? null : Math.min(attempt * 200, 1000)),
  });
  try {
    await redis.connect();
  } catch (error) {
    throw new Error(
      `HEXDEV_REDIS_URL is set to "${url}" but the server could not connect after ${String(MAX_CONNECT_ATTEMPTS)} attempts — ` +
        "refusing to start. A horizontal-scaling deployment must never silently fall back to the in-memory adapters: " +
        "that would reintroduce the exact invisible per-process breakage this configuration exists to close.",
      { cause: error },
    );
  }
  return redis;
}
