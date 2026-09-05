/**
 * The admin panel's configuration — the FOURTH composition root in this
 * repository (mint-server, server, widget-app came before it).
 *
 * WHAT IS DELIBERATELY ABSENT: no signing-key field of any kind. Every other
 * server role in this fleet holds SOME half of the widget's Ed25519 token
 * pair — mint-server holds the seed, the match role holds the public half
 * verify-only. This config holds NEITHER, because this app never mints and
 * never verifies a widget session token at all; its own session mechanism is
 * an unrelated random cookie value hashed into `operator_sessions` (design
 * §11.2, slice 8b), with no cryptographic relationship to the widget's
 * tokens whatsoever. That is what makes "compromise admin ⇒ cannot mint"
 * structurally true rather than a policy nobody enforces (design §6,
 * decisions #3684). `config.test.ts` scans this file's own source for the
 * two variable names a config that DID hold that seed would declare, so the
 * absence stays a checked fact rather than a claim nobody re-verifies after
 * the next edit.
 *
 * `postgresUrl` IS present, because this app's request path holds
 * `convite_admin` — read/write Postgres credentials, deliberately distinct
 * from `convite_readonly` (design §4) — and joins the SAME inverted-guard
 * family `MintServerConfig.postgresUrl`/`ServerConfig.postgresUrl` already
 * establish (design §1.8), never the optional `redisUrl` shape: Postgres is
 * the system of record, so an unset value must fail closed at boot rather
 * than silently serve an empty catalog.
 */
export interface AdminServerConfig {
  readonly port: number;
  readonly postgresUrl: string;
}

const DEFAULT_PORT = 2572; // server:2567, mint-server:2568 (dev-stack.mjs overrides both to 2570/2571) — the next free slot.
const MAX_PORT = 65535;

/**
 * Reads a numeric env var, or refuses to start — the identical guard
 * `apps/mint-server/src/config.ts`'s own `readPositiveNumber` carries,
 * duplicated rather than shared: neither existing role's config imports from
 * the other's, and a third copy following the same convention is simpler
 * than inventing a shared module for three call sites this small.
 * `Number("garbage")` is NaN, which is not nullish and so slips straight
 * through `??`, silently letting the process boot and then misbehave rather
 * than refusing loudly.
 */
function readPositiveNumber(env: NodeJS.ProcessEnv, name: string, fallback: number, max?: number): number {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || (max !== undefined && value > max)) {
    throw new Error(
      `${name} must be a finite number greater than 0${max !== undefined ? ` and at most ${String(max)}` : ""}, got "${raw}" — ` +
        "refusing to start the admin panel with a value that would misbehave silently rather than fail.",
    );
  }
  return value;
}

/**
 * The same checked-in, obviously-insecure dev placeholder
 * `apps/mint-server/src/config.ts`'s own `DEV_POSTGRES_URL` uses — reachable
 * only behind the identical `HEXDEV_ALLOW_DEV_DEFAULTS` opt-in, never in
 * production.
 */
const DEV_POSTGRES_URL = "postgres://postgres@localhost:5432/convite";

/**
 * Reads this app's configuration from the process environment. A pure
 * function of its input, exactly like `loadMintConfig`/`loadServerConfig`,
 * so it is testable without touching real `process.env` or a real Postgres.
 *
 * FAIL-CLOSED BY DEFAULT (design §1.8/§15): a missing `HEXDEV_POSTGRES_URL`
 * is fatal unless `HEXDEV_ALLOW_DEV_DEFAULTS=true` is set explicitly, and
 * that opt-in itself loses to a real production `NODE_ENV`. This app holds
 * WRITE credentials to the system of record, so an accidental empty-catalog
 * boot here is at least as dangerous as it is for the two read-only roles.
 */
export function loadAdminConfig(env: NodeJS.ProcessEnv): AdminServerConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  const allowDevDefaults = env.HEXDEV_ALLOW_DEV_DEFAULTS === "true";
  const postgresUrl = env.HEXDEV_POSTGRES_URL;
  if (postgresUrl === undefined) {
    if (nodeEnv === "production") {
      throw new Error(
        "HEXDEV_POSTGRES_URL must be set in production — refusing to start the admin panel with no reachable Postgres. " +
          "Postgres is the system of record, not an optional scaling adapter.",
      );
    }
    if (!allowDevDefaults) {
      throw new Error(
        "HEXDEV_POSTGRES_URL must be set — refusing to start the admin panel with no reachable Postgres. " +
          "For local development only, set HEXDEV_ALLOW_DEV_DEFAULTS=true to opt in explicitly.",
      );
    }
  }
  return {
    port: readPositiveNumber(env, "PORT", DEFAULT_PORT, MAX_PORT),
    postgresUrl: postgresUrl ?? DEV_POSTGRES_URL,
  };
}

