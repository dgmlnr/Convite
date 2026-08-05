import type { TenantId, TenantRecord } from "@hexdev/platform-core";
import type { GameId } from "@hexdev/platform-contract";

export interface ServerConfig {
  readonly port: number;
  readonly sessionSecret: string;
  readonly sessionTtlSeconds: number;
  readonly tenants: readonly TenantRecord[];
}

const DEFAULT_PORT = 2567;
const DEFAULT_TTL_SECONDS = 120;

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
 * configuration, never be hardcoded, and must fail loudly in production).
 */
export function loadServerConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  const sessionSecret = env.HEXDEV_SESSION_SECRET;
  if (sessionSecret === undefined && nodeEnv === "production") {
    throw new Error("HEXDEV_SESSION_SECRET must be set in production — refusing to start signing tokens with an insecure default.");
  }
  const tenants: readonly TenantRecord[] =
    env.HEXDEV_TENANTS_JSON !== undefined ? (JSON.parse(env.HEXDEV_TENANTS_JSON) as readonly TenantRecord[]) : [DEV_TENANT];
  return {
    port: env.PORT !== undefined ? Number(env.PORT) : DEFAULT_PORT,
    sessionSecret: sessionSecret ?? DEV_SESSION_SECRET,
    sessionTtlSeconds: env.HEXDEV_SESSION_TTL_SECONDS !== undefined ? Number(env.HEXDEV_SESSION_TTL_SECONDS) : DEFAULT_TTL_SECONDS,
    tenants,
  };
}
