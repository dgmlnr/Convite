export interface RateLimitConfig {
  readonly limit: number;
  readonly windowMs: number;
}

/**
 * The minting role's configuration — deliberately NOT the match role's.
 *
 * This is the only process in the fleet that holds the Ed25519 seed, which
 * is the whole point of the split (handoff §P4.3): compromising a
 * match-serving replica must not be a way to mint tokens for everyone. The
 * knobs that shape a game room — `joinIpRateLimit`, `publicAddress`,
 * `queueBotFillSeconds` — are absent on purpose, and a test pins that
 * absence so a future edit cannot quietly re-couple the two configs.
 */
export interface MintServerConfig {
  readonly port: number;
  /** Base64url-encoded, 32-byte Ed25519 signing-key seed — see
   * `@hexdev/platform-core`'s `createSessionTokenIssuer`. Generate one with:
   * `node -e "console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'))"` */
  readonly sessionSigningKey: string;
  readonly sessionTtlSeconds: number;
  /**
   * Postgres connection string this role reads the tenant catalog through
   * (tenant-administration slice 3b, design §1.8/§2.1) — `HEXDEV_TENANTS_JSON`
   * and the checked-in `DEV_TENANT` fixture are gone. Joins the
   * `sessionSigningKey` INVERTED-GUARD family below, deliberately NOT the
   * optional `redisUrl` shape: Postgres is the system of record, so an
   * unset value must fail closed at boot, never fall back to an empty
   * in-memory catalog that silently serves nobody.
   */
  readonly postgresUrl: string;
  readonly embedIpRateLimit: RateLimitConfig;
  readonly embedKeyRateLimit: RateLimitConfig;
  /**
   * The origins `/session/renew` accepts a renewal from — THIS deployment's
   * own widget origin(s), never a tenant's page origin, because the renewal
   * is always issued by code running inside our own iframe.
   *
   * It matters here more than it looks: the widget builds the renewal URL
   * RELATIVE, so the mint role has to sit behind the same public origin as
   * the embed page it served, reached by path routing rather than by its own
   * hostname.
   */
  readonly allowedWidgetOrigins: readonly string[];
  /**
   * Shared rate-limit state across replicas of THIS role. Unset means the
   * in-memory limiter, correct for a single instance and for local dev; set
   * means both limiters below become Redis-backed together, never one alone.
   */
  readonly redisUrl: string | undefined;
}

const DEFAULT_PORT = 2568;
const DEFAULT_TTL_SECONDS = 120;
const DEFAULT_RATE_WINDOW_MS = 60_000;
// Mirrors the match role's disclosed guesses rather than inventing new ones:
// `/embed` is a page-load-time GET so the IP limit is generous, and the key
// limit is higher still because ONE tenant legitimately has many concurrent
// visitors on many IPs hitting the same key.
const DEFAULT_EMBED_IP_LIMIT = 20;
const DEFAULT_EMBED_KEY_LIMIT = 60;

/**
 * Reads a numeric env var, or refuses to start.
 *
 * `Number("lots")` is NaN, and NaN is the worst possible value here because
 * it is not nullish — it slips straight through `??`, and every comparison
 * against it is false, so the process boots and then misbehaves silently
 * rather than failing. This repo already learned that on
 * `HEXDEV_QUEUE_BOT_FILL_SECONDS`, where a NaN threshold made every
 * multi-seat queue bot-fill on its first tick; that guard was itself the
 * product of a review correction, and this is the same guard applied to the
 * variables this role actually reads.
 *
 * The message names the variable on purpose. A bare "invalid configuration"
 * is the difference between a five-minute fix and an hour of bisecting env.
 */
function readPositiveNumber(env: NodeJS.ProcessEnv, name: string, fallback: number, max?: number): number {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || (max !== undefined && value > max)) {
    throw new Error(
      `${name} must be a finite number greater than 0${max !== undefined ? ` and at most ${String(max)}` : ""}, got "${raw}" — ` +
        "refusing to start the minting role with a value that would misbehave silently rather than fail.",
    );
  }
  return value;
}

const MAX_PORT = 65535;

function readRateLimit(env: NodeJS.ProcessEnv, limitVar: string, windowVar: string, defaultLimit: number): RateLimitConfig {
  return {
    limit: readPositiveNumber(env, limitVar, defaultLimit),
    windowMs: readPositiveNumber(env, windowVar, DEFAULT_RATE_WINDOW_MS),
  };
}

/** The same checked-in dev placeholder the match role uses, and for the same
 * reason: `createSessionTokenIssuer` validates the SHAPE of whatever it is
 * given, so even local dev needs a well-formed 32-byte base64url seed. It is
 * the SHA-256 of the string named below, carries no secrecy, and is
 * unreachable in production by the guard in `loadMintConfig`. */
const DEV_SESSION_SIGNING_KEY = "oUW9QPNCc-C-rkyKCakJbggyhW2quFy4Kv98Pyd7MeI"; // sha256("dev-only-insecure-signing-key-DO-NOT-USE-IN-PRODUCTION")

/**
 * Local-dev-only Postgres connection string, in the same "obviously
 * insecure, checked into source, never reachable in production" spirit as
 * `DEV_SESSION_SIGNING_KEY` above — reachable only behind the identical
 * `HEXDEV_ALLOW_DEV_DEFAULTS` opt-in. Shape matches the convention
 * `postgres-tests/global-setup.ts` and `scripts/dev-stack.mjs` both already
 * use for a local Postgres: db `convite`, user `postgres`, trust auth.
 *
 * `pnpm dev:server` overrides this with its own ephemeral container's real
 * URL (`scripts/dev-stack.mjs` sets `HEXDEV_POSTGRES_URL` explicitly before
 * spawning this role); this fallback only matters for running this role
 * directly against an already-running local Postgres, with no dev-stack
 * orchestration involved at all.
 */
const DEV_POSTGRES_URL = "postgres://postgres@localhost:5432/convite";

/**
 * Reads this role's configuration from the process environment. A pure
 * function of its input so it is testable without touching real `process.env`.
 *
 * FAIL-CLOSED BY DEFAULT, the same inverted guard the match role already
 * carries: a missing seed is fatal UNLESS `HEXDEV_ALLOW_DEV_DEFAULTS=true` is
 * set explicitly — a deliberate choice, never an accident of a forgotten
 * NODE_ENV — and even that opt-in is refused once NODE_ENV really is
 * "production". It matters more here than it did there, because after the
 * split this is the ONLY process that can mint at all.
 *
 * Only PRESENCE is validated. SHAPE is `createSessionTokenIssuer`'s job,
 * awaited at the top of `index.ts` under the same "throw, crash boot"
 * convention — which is what keeps this function synchronous and pure, since
 * importing a key is unavoidably async.
 */
export function loadMintConfig(env: NodeJS.ProcessEnv): MintServerConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  const allowDevDefaults = env.HEXDEV_ALLOW_DEV_DEFAULTS === "true";
  const sessionSigningKey = env.HEXDEV_SESSION_SIGNING_KEY;
  if (sessionSigningKey === undefined) {
    if (nodeEnv === "production") {
      throw new Error("HEXDEV_SESSION_SIGNING_KEY must be set in production — refusing to start the minting role with an insecure default.");
    }
    if (!allowDevDefaults) {
      throw new Error(
        "HEXDEV_SESSION_SIGNING_KEY must be set — refusing to start the minting role with an insecure default. " +
          "For local development only, set HEXDEV_ALLOW_DEV_DEFAULTS=true to opt in explicitly.",
      );
    }
  }
  const postgresUrl = env.HEXDEV_POSTGRES_URL;
  if (postgresUrl === undefined) {
    if (nodeEnv === "production") {
      throw new Error(
        "HEXDEV_POSTGRES_URL must be set in production — refusing to start the minting role with no reachable Postgres. " +
          "Postgres is the system of record, not an optional scaling adapter.",
      );
    }
    if (!allowDevDefaults) {
      throw new Error(
        "HEXDEV_POSTGRES_URL must be set — refusing to start the minting role with no reachable Postgres. " +
          "For local development only, set HEXDEV_ALLOW_DEV_DEFAULTS=true to opt in explicitly.",
      );
    }
  }
  const port = readPositiveNumber(env, "PORT", DEFAULT_PORT, MAX_PORT);
  return {
    port,
    sessionSigningKey: sessionSigningKey ?? DEV_SESSION_SIGNING_KEY,
    sessionTtlSeconds: readPositiveNumber(env, "HEXDEV_SESSION_TTL_SECONDS", DEFAULT_TTL_SECONDS),
    postgresUrl: postgresUrl ?? DEV_POSTGRES_URL,
    embedIpRateLimit: readRateLimit(env, "HEXDEV_EMBED_IP_RATE_LIMIT", "HEXDEV_EMBED_IP_RATE_WINDOW_MS", DEFAULT_EMBED_IP_LIMIT),
    embedKeyRateLimit: readRateLimit(env, "HEXDEV_EMBED_KEY_RATE_LIMIT", "HEXDEV_EMBED_KEY_RATE_WINDOW_MS", DEFAULT_EMBED_KEY_LIMIT),
    allowedWidgetOrigins: env.HEXDEV_WIDGET_ORIGIN !== undefined ? env.HEXDEV_WIDGET_ORIGIN.split(",") : [`http://localhost:${String(port)}`],
    redisUrl: env.HEXDEV_REDIS_URL,
  };
}
