import type { TenantId, TenantRecord } from "@hexdev/platform-core";
import type { GameId } from "@hexdev/platform-contract";

export interface RateLimitConfig {
  readonly limit: number;
  readonly windowMs: number;
}

export interface ServerConfig {
  readonly port: number;
  readonly sessionSecret: string;
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
 * never reachable in production (see the throw below). Security posture:
 * the HMAC secret comes from configuration/environment, never hardcoded for
 * a real deployment. */
const DEV_SESSION_SECRET = "dev-only-insecure-secret-DO-NOT-USE-IN-PRODUCTION";

/** A single fixture tenant so a fresh clone's server is curl-able with zero
 * setup. Not a secret — an embed key and an origin allowlist are meant to be
 * public (design §7: "same trust model as a Stripe publishable key"). Real
 * tenant administration (design §7: manual, v1 has no self-service) is a
 * config-file/`HEXDEV_TENANTS_JSON` concern, not this fixture's job. */
const DEV_TENANT: TenantRecord = {
  id: "dev-tenant" as TenantId,
  embedKey: "pk_dev_local",
  allowedOrigins: ["http://localhost:5173", "http://localhost:3000"],
  entitledGames: ["truco-argentino" as GameId],
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
  const sessionSecret = env.HEXDEV_SESSION_SECRET;
  if (sessionSecret === undefined) {
    if (nodeEnv === "production") {
      throw new Error("HEXDEV_SESSION_SECRET must be set in production — refusing to start signing tokens with an insecure default.");
    }
    if (!allowDevDefaults) {
      throw new Error(
        "HEXDEV_SESSION_SECRET must be set — refusing to start with an insecure default. " +
          "For local development only, set HEXDEV_ALLOW_DEV_DEFAULTS=true to opt in explicitly.",
      );
    }
  }
  const tenants: readonly TenantRecord[] =
    env.HEXDEV_TENANTS_JSON !== undefined ? (JSON.parse(env.HEXDEV_TENANTS_JSON) as readonly TenantRecord[]) : [DEV_TENANT];
  const port = env.PORT !== undefined ? Number(env.PORT) : DEFAULT_PORT;
  return {
    port,
    sessionSecret: sessionSecret ?? DEV_SESSION_SECRET,
    sessionTtlSeconds: env.HEXDEV_SESSION_TTL_SECONDS !== undefined ? Number(env.HEXDEV_SESSION_TTL_SECONDS) : DEFAULT_TTL_SECONDS,
    tenants,
    embedIpRateLimit: readRateLimit(env, "HEXDEV_EMBED_IP_RATE_LIMIT", "HEXDEV_EMBED_IP_RATE_WINDOW_MS", DEFAULT_EMBED_IP_LIMIT),
    embedKeyRateLimit: readRateLimit(env, "HEXDEV_EMBED_KEY_RATE_LIMIT", "HEXDEV_EMBED_KEY_RATE_WINDOW_MS", DEFAULT_EMBED_KEY_LIMIT),
    joinIpRateLimit: readRateLimit(env, "HEXDEV_JOIN_IP_RATE_LIMIT", "HEXDEV_JOIN_IP_RATE_WINDOW_MS", DEFAULT_JOIN_IP_LIMIT),
    allowedWidgetOrigins: env.HEXDEV_WIDGET_ORIGIN !== undefined ? env.HEXDEV_WIDGET_ORIGIN.split(",") : [`http://localhost:${port}`],
  };
}
