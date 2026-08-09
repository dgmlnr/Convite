import type { TenantId, TenantRecord } from "@hexdev/platform-core";
import type { GameId } from "@hexdev/platform-contract";

export interface RateLimitConfig {
  readonly limit: number;
  readonly windowMs: number;
}

export interface ServerConfig {
  readonly port: number;
  /** Base64url-encoded, 32-byte Ed25519 signing-key seed (see
   * `@hexdev/platform-core`'s `createSessionTokenIssuer`) — NOT an arbitrary
   * passphrase (that was the prior HMAC design, obs 2942's disclosed
   * deviation, now resolved). Generate one with:
   * `node -e "console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'))"` */
  readonly sessionSigningKey: string;
  readonly sessionTtlSeconds: number;
  readonly tenants: readonly TenantRecord[];
  readonly embedIpRateLimit: RateLimitConfig;
  readonly embedKeyRateLimit: RateLimitConfig;
  readonly joinIpRateLimit: RateLimitConfig;
  /** `MatchRoom.onAuth`'s WS-join origin re-validation target (see
   * `MatchRoomAuthOptions`'s own docstring for the real bug this closes: it
   * is THIS server's own widget origin(s), never a tenant's page origin —
   * the WebSocket is always opened from code running inside our own
   * iframe). Defaults to this process's own `http://localhost:<port>` for a
   * zero-setup dev run; a real deployment sets `HEXDEV_WIDGET_ORIGIN`
   * (comma-separated for multiple environments) to its real public origin. */
  readonly allowedWidgetOrigins: readonly string[];
  /**
   * The single knob for horizontal scaling: `undefined` (default, no
   * required setup) means every port stays the in-memory, single-process
   * adapter this server has always run — a single instance or local dev
   * deploy needs NO Redis and NO new required config. Set means ALL FOUR
   * (`RateLimiter`, `JtiReplayGuard`, `MatchmakingPool`, and Colyseus's own
   * `RedisPresence`/`RedisDriver`) switch to Redis-backed together — there
   * is deliberately no way to configure only some of them. A half-migrated
   * deployment (our pools shared, Colyseus's own matchmaking still
   * process-local, or the reverse) would be a NEW invisible-breakage shape,
   * not a smaller one — the exact failure class this unit exists to remove.
   * One env var makes that combination structurally unrepresentable rather
   * than merely discouraged.
   */
  readonly redisUrl: string | undefined;
  /**
   * This process's own reachable `host:port`, forwarded to Colyseus's own
   * `publicAddress` option (see `MatchServerOptions.publicAddress`'s own
   * docstring in `transport-colyseus`). Only meaningful together with
   * `redisUrl` — a single-instance deployment never needs a second process
   * to find this one. `undefined` by default: correct for local dev and for
   * any deployment where every client already reaches this process at the
   * same address it used for the matchmake HTTP call.
   */
  readonly publicAddress: string | undefined;
}

const DEFAULT_PORT = 2567;
const DEFAULT_TTL_SECONDS = 120;
const DEFAULT_RATE_WINDOW_MS = 60_000;
// GUESSED DEFAULTS, disclosed honestly: not informed by real production
// traffic data. A real number needs observed legitimate request rates per
// tenant/IP from actual usage. `/embed` is a page-load-time GET (rare per
// visitor), so the IP limit is deliberately generous; the key limit is
// higher still since ONE tenant can have many concurrent legitimate
// visitors, each a different IP, hitting the same key. Room join is a
// heavier operation (opens a socket) so its default is stricter.
const DEFAULT_EMBED_IP_LIMIT = 20;
const DEFAULT_EMBED_KEY_LIMIT = 60;
const DEFAULT_JOIN_IP_LIMIT = 10;

function readRateLimit(env: NodeJS.ProcessEnv, limitVar: string, windowVar: string, defaultLimit: number): RateLimitConfig {
  return {
    limit: env[limitVar] !== undefined ? Number(env[limitVar]) : defaultLimit,
    windowMs: env[windowVar] !== undefined ? Number(env[windowVar]) : DEFAULT_RATE_WINDOW_MS,
  };
}

/** Obviously a dev-only placeholder — never a real signing credential, and
 * never reachable in production (see the throw below). A validly-shaped
 * (32-byte, base64url) Ed25519 seed is still required even for local dev,
 * since `createSessionTokenIssuer` now validates the SHAPE of whatever key
 * material it is given, not just its presence — this exact value is the
 * SHA-256 digest of the literal string below it, base64url-encoded, chosen
 * only for reproducibility; it carries no real secrecy and is checked
 * straight into source control. Security posture unchanged from before:
 * the signing key comes from configuration/environment, never hardcoded for
 * a real deployment. */
const DEV_SESSION_SIGNING_KEY = "oUW9QPNCc-C-rkyKCakJbggyhW2quFy4Kv98Pyd7MeI"; // sha256("dev-only-insecure-signing-key-DO-NOT-USE-IN-PRODUCTION")

/** A single fixture tenant so a fresh clone's server is curl-able with zero
 * setup. Not a secret — an embed key and an origin allowlist are meant to be
 * public (design §7: "same trust model as a Stripe publishable key"). Real
 * tenant administration (design §7: manual, v1 has no self-service) is a
 * config-file/`HEXDEV_TENANTS_JSON` concern, not this fixture's job. */
const DEV_TENANT: TenantRecord = {
  id: "dev-tenant" as TenantId,
  embedKey: "pk_dev_local",
  allowedOrigins: ["http://localhost:5173", "http://localhost:3000"],
  entitledGames: ["truco-argentino" as GameId, "truco-argentino-2v2" as GameId],
};

/**
 * Reads the composition root's configuration from the process environment.
 * A pure function of its input so it is testable without touching real
 * `process.env` (obs 2942's honesty mandate: the secret must come from
 * configuration, never be hardcoded).
 *
 * FAIL-CLOSED BY DEFAULT (hardening, obs 2945 §7): the original guard only
 * refused when `NODE_ENV` was LITERALLY `"production"` — an unset, `"prod"`,
 * or `"staging"` value ran insecurely with the dev secret and no error at
 * all. The default is now inverted: any missing secret is fatal UNLESS
 * `HEXDEV_ALLOW_DEV_DEFAULTS=true` is set explicitly (a deliberate, informed
 * choice, never an accident of a forgotten `NODE_ENV`) — and even that
 * opt-in is still refused once `NODE_ENV` really is `"production"`.
 */
export function loadServerConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  const allowDevDefaults = env.HEXDEV_ALLOW_DEV_DEFAULTS === "true";
  const sessionSigningKey = env.HEXDEV_SESSION_SIGNING_KEY;
  if (sessionSigningKey === undefined) {
    if (nodeEnv === "production") {
      throw new Error("HEXDEV_SESSION_SIGNING_KEY must be set in production — refusing to start signing tokens with an insecure default.");
    }
    if (!allowDevDefaults) {
      throw new Error(
        "HEXDEV_SESSION_SIGNING_KEY must be set — refusing to start with an insecure default. " +
          "For local development only, set HEXDEV_ALLOW_DEV_DEFAULTS=true to opt in explicitly.",
      );
    }
  }
  // Only PRESENCE is validated here — SHAPE (a well-formed 32-byte Ed25519
  // seed) is validated by `createSessionTokenIssuer` itself, awaited at the
  // top of `apps/server/src/index.ts`'s composition root, same "throw,
  // crash boot" convention `redis-client.ts`'s own fail-loud connect uses.
  // `loadServerConfig` stays synchronous (importing a key is unavoidably
  // async — Web Crypto has no sync digest/import) and pure (no crypto calls
  // of its own), matching every existing test in `config.test.ts`.
  const tenants: readonly TenantRecord[] =
    env.HEXDEV_TENANTS_JSON !== undefined ? (JSON.parse(env.HEXDEV_TENANTS_JSON) as readonly TenantRecord[]) : [DEV_TENANT];
  const port = env.PORT !== undefined ? Number(env.PORT) : DEFAULT_PORT;
  return {
    port,
    sessionSigningKey: sessionSigningKey ?? DEV_SESSION_SIGNING_KEY,
    sessionTtlSeconds: env.HEXDEV_SESSION_TTL_SECONDS !== undefined ? Number(env.HEXDEV_SESSION_TTL_SECONDS) : DEFAULT_TTL_SECONDS,
    tenants,
    embedIpRateLimit: readRateLimit(env, "HEXDEV_EMBED_IP_RATE_LIMIT", "HEXDEV_EMBED_IP_RATE_WINDOW_MS", DEFAULT_EMBED_IP_LIMIT),
    embedKeyRateLimit: readRateLimit(env, "HEXDEV_EMBED_KEY_RATE_LIMIT", "HEXDEV_EMBED_KEY_RATE_WINDOW_MS", DEFAULT_EMBED_KEY_LIMIT),
    joinIpRateLimit: readRateLimit(env, "HEXDEV_JOIN_IP_RATE_LIMIT", "HEXDEV_JOIN_IP_RATE_WINDOW_MS", DEFAULT_JOIN_IP_LIMIT),
    allowedWidgetOrigins: env.HEXDEV_WIDGET_ORIGIN !== undefined ? env.HEXDEV_WIDGET_ORIGIN.split(",") : [`http://localhost:${port}`],
    redisUrl: env.HEXDEV_REDIS_URL,
    publicAddress: env.HEXDEV_PUBLIC_ADDRESS,
  };
}
