import { findTenantRecordListProblem } from "@hexdev/platform-core";
import type { TenantId, TenantRecord } from "@hexdev/platform-core";
import type { GameId } from "@hexdev/platform-contract";

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
  readonly tenants: readonly TenantRecord[];
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

/**
 * Parses the tenants document, or refuses to start with a message an
 * operator can act on. A bare `SyntaxError: Unexpected token }` does not say
 * which variable produced it; the signing-key guard in this same file
 * already sets the standard for what a configuration failure should read
 * like. The shape is checked too — a document that parses to an object
 * rather than a list would otherwise fail much later, as an empty catalog on
 * every `/embed`.
 */
function readTenants(env: NodeJS.ProcessEnv, fallback: readonly TenantRecord[]): readonly TenantRecord[] {
  const raw = env.HEXDEV_TENANTS_JSON;
  if (raw === undefined) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`HEXDEV_TENANTS_JSON is set but is not valid JSON — refusing to start the minting role with an unreadable tenant list.`, { cause: error });
  }
  const problem = findTenantRecordListProblem(parsed);
  if (problem !== null) {
    throw new Error(`HEXDEV_TENANTS_JSON ${problem} — refusing to start the minting role with an unusable tenant list.`);
  }
  return parsed as readonly TenantRecord[];
}

/** The same checked-in dev placeholder the match role uses, and for the same
 * reason: `createSessionTokenIssuer` validates the SHAPE of whatever it is
 * given, so even local dev needs a well-formed 32-byte base64url seed. It is
 * the SHA-256 of the string named below, carries no secrecy, and is
 * unreachable in production by the guard in `loadMintConfig`. */
const DEV_SESSION_SIGNING_KEY = "oUW9QPNCc-C-rkyKCakJbggyhW2quFy4Kv98Pyd7MeI"; // sha256("dev-only-insecure-signing-key-DO-NOT-USE-IN-PRODUCTION")

/** One fixture tenant so a fresh clone is curl-able with zero setup. Not a
 * secret: an embed key and an origin allowlist are meant to be public
 * (design §7, "same trust model as a Stripe publishable key"). */
const DEV_TENANT: TenantRecord = {
  id: "dev-tenant" as TenantId,
  embedKey: "pk_dev_local",
  allowedOrigins: ["http://localhost:5173", "http://localhost:3000"],
  entitledGames: ["truco-argentino" as GameId, "truco-argentino-2v2" as GameId, "escoba-de-15" as GameId, "escoba-de-15-2v2" as GameId],
};

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
  const port = readPositiveNumber(env, "PORT", DEFAULT_PORT, MAX_PORT);
  return {
    port,
    sessionSigningKey: sessionSigningKey ?? DEV_SESSION_SIGNING_KEY,
    sessionTtlSeconds: readPositiveNumber(env, "HEXDEV_SESSION_TTL_SECONDS", DEFAULT_TTL_SECONDS),
    tenants: readTenants(env, [DEV_TENANT]),
    embedIpRateLimit: readRateLimit(env, "HEXDEV_EMBED_IP_RATE_LIMIT", "HEXDEV_EMBED_IP_RATE_WINDOW_MS", DEFAULT_EMBED_IP_LIMIT),
    embedKeyRateLimit: readRateLimit(env, "HEXDEV_EMBED_KEY_RATE_LIMIT", "HEXDEV_EMBED_KEY_RATE_WINDOW_MS", DEFAULT_EMBED_KEY_LIMIT),
    allowedWidgetOrigins: env.HEXDEV_WIDGET_ORIGIN !== undefined ? env.HEXDEV_WIDGET_ORIGIN.split(",") : [`http://localhost:${String(port)}`],
    redisUrl: env.HEXDEV_REDIS_URL,
  };
}
