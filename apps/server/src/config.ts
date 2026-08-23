import { findTenantRecordListProblem } from "@hexdev/platform-core";
import type { TenantId, TenantRecord } from "@hexdev/platform-core";
import type { GameId } from "@hexdev/platform-contract";

export interface RateLimitConfig {
  readonly limit: number;
  readonly windowMs: number;
}

export interface ServerConfig {
  readonly port: number;
  /**
   * Base64url-encoded, 32-byte Ed25519 PUBLIC key — never a seed.
   *
   * This role verifies tokens and cannot mint them, which is the whole point
   * of the mint/verify split (handoff §P4.3): before it, every replica held
   * the signing seed, so compromising ANY instance meant minting for the
   * entire fleet. The seed now lives only in `apps/mint-server`, and this
   * process is given the matching public half.
   *
   * It comes from the mint role's own issuer: `createSessionTokenIssuer`
   * returns a handle whose `publicKey` is exactly this value.
   */
  readonly sessionPublicKey: string;
  readonly sessionTtlSeconds: number;
  readonly tenants: readonly TenantRecord[];
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
  /**
   * PR-2b: how long the oldest waiter in a >2-seat matchmaking queue may
   * wait before the lobby degrades the queue to bot-fill — forwarded to
   * `PresenceRoomCreateOptions.botFillAfterSeconds` (see that knob's own
   * docstring; a 2-seat queue never degrades). Seconds, default 30.
   */
  readonly queueBotFillSeconds: number;
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
const DEFAULT_JOIN_IP_LIMIT = 10;
// 30s mirrors MatchRoom's reconnection window (obs 2919's decided duration
// for "how long is a player asked to wait"): long enough that a real fourth
// human arriving moments later still forms a full table, short enough that
// three friends queueing together are never held hostage by a stranger who
// never comes.
const DEFAULT_QUEUE_BOT_FILL_SECONDS = 30;

const MAX_PORT = 65535;

/**
 * Reads a numeric env var, or refuses to start.
 *
 * This is the guard `HEXDEV_QUEUE_BOT_FILL_SECONDS` below already carries,
 * generalised to the other numeric variables this config reads — they had
 * been left on a bare `Number()`. NaN is the dangerous value precisely
 * because it is not nullish: it slips straight through `??`, and every
 * comparison against it is false, so the process boots and misbehaves
 * silently instead of failing. The message names the variable for the same
 * reason that one does.
 *
 * Found by the review of `apps/mint-server`, which inherited the gap from
 * this file; fixed in both rather than only in the newer one.
 */
function readPositiveNumber(env: NodeJS.ProcessEnv, name: string, fallback: number, max?: number): number {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || (max !== undefined && value > max)) {
    throw new Error(
      `${name} must be a finite number greater than 0${max !== undefined ? ` and at most ${String(max)}` : ""}, got "${raw}" — ` +
        "refusing to start with a value that would misbehave silently rather than fail.",
    );
  }
  return value;
}

/**
 * Parses the tenants document, or refuses to start with a message an
 * operator can act on. A bare `SyntaxError: Unexpected token }` does not name
 * the variable it came from.
 *
 * The ELEMENTS are checked too, by `findTenantRecordListProblem` next to the
 * type itself — this used to claim they were while only checking
 * `Array.isArray` and then casting, which let a list of the wrong shape start
 * the process and surface much later as tenants that silently never match.
 * The rules live in `platform-core` because both roles read this same document
 * and two copies of them is how the two drift apart.
 */
function readTenants(env: NodeJS.ProcessEnv, fallback: readonly TenantRecord[]): readonly TenantRecord[] {
  const raw = env.HEXDEV_TENANTS_JSON;
  if (raw === undefined) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("HEXDEV_TENANTS_JSON is set but is not valid JSON — refusing to start with an unreadable tenant list.", { cause: error });
  }
  const problem = findTenantRecordListProblem(parsed);
  if (problem !== null) {
    throw new Error(`HEXDEV_TENANTS_JSON ${problem} — refusing to start with an unusable tenant list.`);
  }
  return parsed as readonly TenantRecord[];
}

function readRateLimit(env: NodeJS.ProcessEnv, limitVar: string, windowVar: string, defaultLimit: number): RateLimitConfig {
  return {
    limit: readPositiveNumber(env, limitVar, defaultLimit),
    windowMs: readPositiveNumber(env, windowVar, DEFAULT_RATE_WINDOW_MS),
  };
}

/** Obviously a dev-only placeholder — never a real signing credential, and
 * never reachable in production (see the throw below). A validly-shaped
 * (32-byte, base64url) Ed25519 seed is still required even for local dev,
 * since `createSessionTokenVerifier` validates the SHAPE of whatever key
 * material it is given, not just its presence — this exact value is the
 * SHA-256 digest of the literal string below it, base64url-encoded, chosen
 * only for reproducibility; it carries no real secrecy and is checked
 * straight into source control. Security posture unchanged from before:
 * the signing key comes from configuration/environment, never hardcoded for
 * a real deployment. */
const DEV_SESSION_PUBLIC_KEY = "KUWvW8s_-ytjibpR0k8JzH2priEPfeNvAWoomP5wfrw"; // the Ed25519 public half of apps/mint-server's own DEV_SESSION_SIGNING_KEY

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
  const sessionPublicKey = env.HEXDEV_SESSION_PUBLIC_KEY;
  if (sessionPublicKey === undefined) {
    if (nodeEnv === "production") {
      throw new Error("HEXDEV_SESSION_PUBLIC_KEY must be set in production — refusing to start verifying tokens against an insecure default key.");
    }
    if (!allowDevDefaults) {
      throw new Error(
        "HEXDEV_SESSION_PUBLIC_KEY must be set — refusing to start with an insecure default. " +
          "For local development only, set HEXDEV_ALLOW_DEV_DEFAULTS=true to opt in explicitly. " +
          "The value is the `publicKey` of the minting role's issuer; this process never holds the seed.",
      );
    }
  }
  // Only PRESENCE is validated here — SHAPE (a well-formed 32-byte Ed25519
  // public key) is validated by `createSessionTokenVerifier` itself, awaited at the
  // top of `apps/server/src/index.ts`'s composition root, same "throw,
  // crash boot" convention `redis-client.ts`'s own fail-loud connect uses.
  // `loadServerConfig` stays synchronous (importing a key is unavoidably
  // async — Web Crypto has no sync digest/import) and pure (no crypto calls
  // of its own), matching every existing test in `config.test.ts`.
  const tenants: readonly TenantRecord[] = readTenants(env, [DEV_TENANT]);
  const port = readPositiveNumber(env, "PORT", DEFAULT_PORT, MAX_PORT);
  const queueBotFillSeconds = env.HEXDEV_QUEUE_BOT_FILL_SECONDS !== undefined ? Number(env.HEXDEV_QUEUE_BOT_FILL_SECONDS) : DEFAULT_QUEUE_BOT_FILL_SECONDS;
  // Fail-loud, same convention as the signing-key guard above: a NaN slips
  // straight through PresenceRoom's `??` default (nullish coalescing only
  // substitutes null/undefined), and its "younger than the threshold" skip
  // (`now - enqueuedAt < botFillAfterMs`) is ALWAYS false against NaN — so
  // every waiter counts as past the threshold and every >2-seat queue
  // silently bot-fills on its FIRST sweep tick. A non-positive value
  // degrades the same way, just without the NaN disguise.
  if (!Number.isFinite(queueBotFillSeconds) || queueBotFillSeconds <= 0) {
    throw new Error(
      `HEXDEV_QUEUE_BOT_FILL_SECONDS must be a finite number greater than 0, got "${String(env.HEXDEV_QUEUE_BOT_FILL_SECONDS)}" — refusing to start with a degradation threshold that would silently bot-fill every multi-seat queue immediately.`,
    );
  }
  return {
    port,
    sessionPublicKey: sessionPublicKey ?? DEV_SESSION_PUBLIC_KEY,
    sessionTtlSeconds: readPositiveNumber(env, "HEXDEV_SESSION_TTL_SECONDS", DEFAULT_TTL_SECONDS),
    tenants,
    joinIpRateLimit: readRateLimit(env, "HEXDEV_JOIN_IP_RATE_LIMIT", "HEXDEV_JOIN_IP_RATE_WINDOW_MS", DEFAULT_JOIN_IP_LIMIT),
    allowedWidgetOrigins: env.HEXDEV_WIDGET_ORIGIN !== undefined ? env.HEXDEV_WIDGET_ORIGIN.split(",") : [`http://localhost:${port}`],
    redisUrl: env.HEXDEV_REDIS_URL,
    publicAddress: env.HEXDEV_PUBLIC_ADDRESS,
    queueBotFillSeconds,
  };
}
