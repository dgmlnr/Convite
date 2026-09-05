import { Pool } from "pg";

/**
 * Constructs and CONNECTS the one shared `pg` `Pool` this process uses for
 * every Postgres-backed adapter — the same "fail loud at boot" convention
 * `redis-client.ts`'s own docstring establishes (design §15 / decision 4:
 * "a misconfigured datastore must fail loudly at boot, never silently
 * misbehave at request time").
 *
 * `pg`'s `Pool` does NOT connect eagerly by itself: it opens a connection
 * lazily on the first `.query()`/`.connect()` call, so a broken
 * `HEXDEV_POSTGRES_URL` would otherwise surface as the FIRST REQUEST's
 * failure, deep inside a handler, rather than at boot where an operator can
 * act on it immediately. This function forces that attempt NOW by checking
 * a client out of the pool and releasing it straight back — the cheapest
 * proof the pool can genuinely reach Postgres.
 *
 * `connectionTimeoutMillis` is set explicitly for the same reason
 * `connectRedis`'s bounded `retryStrategy` exists: `pg`'s own default has no
 * connection timeout at all, so an unreachable-but-not-refusing host (a
 * firewall silently dropping packets, rather than a closed port refusing
 * them) would hang this function, and boot, forever — the opposite of
 * "fail loud".
 */
const CONNECTION_TIMEOUT_MS = 5_000;

export async function connectPostgres(url: string): Promise<Pool> {
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: CONNECTION_TIMEOUT_MS });
  try {
    const client = await pool.connect();
    client.release();
  } catch (error) {
    await pool.end();
    throw new Error(
      `HEXDEV_POSTGRES_URL is set to "${url}" but the server could not connect — refusing to start. ` +
        "A misconfigured or unreachable Postgres must never be treated as an in-memory fallback: " +
        "Postgres is the system of record, not an optional scaling adapter.",
      { cause: error },
    );
  }
  return pool;
}
