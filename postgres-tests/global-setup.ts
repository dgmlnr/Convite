import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFreePorts } from "../e2e/support/free-ports.js";

const POSTGRES_TESTS_DIR = fileURLToPath(new URL(".", import.meta.url));

/** File-based handoff to every `*.postgres.test.ts` file — same pattern as
 * `redis-tests/global-setup.ts`'s own harness file. Gitignored, run-scoped. */
export const POSTGRES_HARNESS_INFO_PATH = path.join(POSTGRES_TESTS_DIR, ".harness", "info.json");

/**
 * Both program-generated (threat: Subprocess — a container name or port
 * built from external input would let that input reach a shell). `pid`
 * comes from `process.pid`, `port` from `getFreePorts`; neither this
 * function nor its caller ever reads an env var or CLI arg into either.
 * Pure and exported so `global-setup.test.ts` can prove it directly, without
 * touching Docker.
 */
export function containerNameFor(pid: number): string {
  return `hexdev-postgres-test-${String(pid)}`;
}

/**
 * An ARGV ARRAY, never a shell string — `spawnSync` below passes this
 * straight through with no shell involved, so nothing in it is ever
 * re-parsed as shell syntax. Pure and exported for the same reason as
 * `containerNameFor`.
 */
export function dockerRunArgs(containerName: string, port: number): readonly string[] {
  return [
    "run",
    "-d",
    "--rm",
    "--name",
    containerName,
    "-p",
    `${String(port)}:5432`,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e",
    "POSTGRES_DB=convite",
    "postgres:17-alpine",
  ];
}

function run(command: string, args: readonly string[], description: string, envOverride?: Record<string, string>): void {
  console.log(`[postgres:setup] ${description}`);
  const result = spawnSync(command, args, { stdio: "inherit", env: envOverride === undefined ? process.env : { ...process.env, ...envOverride } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`[postgres:setup] FAILED (exit ${String(result.status)}): ${description}`);
}

/**
 * Polls `docker exec <container> pg_isready` rather than importing `pg`
 * directly: this file lives outside every workspace package (`postgres-tests`
 * is not a pnpm workspace member — same reasoning as `redis-tests/global-
 * setup.ts` never importing `ioredis`), and `pg_isready` is already bundled
 * in the `postgres:17-alpine` image, so this needs no new dependency.
 */
async function waitForPostgresReady(containerName: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "postgres"], { encoding: "utf8" });
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`postgres container ${containerName} never became ready within ${String(timeoutMs)}ms`);
}

export interface ProvisionedPostgres {
  readonly postgresUrl: string;
  /** Synchronous on purpose — `spawnSync("docker", ["stop", ...])` already
   * blocks, so there is nothing here worth wrapping in a Promise, and a
   * synchronous signature is one a plain `node` script (no top-level await
   * ceremony needed to call it) can use identically to a vitest teardown. */
  readonly stop: () => void;
}

/**
 * THE REUSABLE CORE (tenant-administration PR4e — extracted so `e2e/global-
 * setup.ts` can provision the e2e harness's own Postgres the SAME way,
 * rather than growing a second, independently drifting copy of the CI-
 * branch/local-Docker logic). This is the identical "pure-ish logic
 * separated from its one caller's own wiring" split `dev-tenant-seed.mjs`
 * already uses relative to `dev-stack.mjs` — here the two callers are this
 * file's own `setup()` below (vitest's `globalSetup` contract) and
 * `e2e/global-setup.ts`'s own default export (vitest's identical contract
 * for a DIFFERENT suite).
 *
 * Serves BOTH environments (design §14): `HEXDEV_TEST_POSTGRES_URL` set means
 * a GitHub Actions `services:` container was already provisioned and health-
 * checked before this job's steps ran — connect to it directly, nothing to
 * start or stop here. Unset means local development: start ONE real Postgres
 * container, the same self-managed `docker run` shape `redis-tests/global-
 * setup.ts` already proves. Either way, applies every migration against it
 * before returning — design §14's "who calls it" table: "against the test
 * database, before any spec file".
 */
export async function provisionPostgres(): Promise<ProvisionedPostgres> {
  const externalUrl = process.env.HEXDEV_TEST_POSTGRES_URL;
  if (externalUrl !== undefined) {
    run("pnpm", ["run", "db:migrate"], "applying migrations against CI's service-container database", { HEXDEV_POSTGRES_MIGRATE_URL: externalUrl });
    console.log("[postgres:setup] using CI's Postgres service container, migrations applied");
    return { postgresUrl: externalUrl, stop: () => {} };
  }

  const [port] = await getFreePorts(1);
  const containerName = containerNameFor(process.pid);
  run("docker", dockerRunArgs(containerName, port), `starting Postgres container ${containerName} on port ${String(port)}`);
  await waitForPostgresReady(containerName, 20_000);

  const postgresUrl = `postgres://postgres@127.0.0.1:${String(port)}/convite`;
  run("pnpm", ["run", "db:migrate"], "applying migrations against the fresh test database", { HEXDEV_POSTGRES_MIGRATE_URL: postgresUrl });
  console.log(`[postgres:setup] Postgres ready at ${postgresUrl}, migrations applied`);

  return { postgresUrl, stop: () => spawnSync("docker", ["stop", containerName]) };
}

/**
 * Vitest's own `globalSetup` contract (`vitest.postgres.config.ts`): runs
 * once, in the main CLI process, before any `*.postgres.test.ts` file; its
 * return value is the teardown called once after the whole run.
 *
 * Runs `pnpm run typecheck` first, same reasoning as `redis-tests/global-
 * setup.ts`: `provisionPostgres`'s own `pnpm run db:migrate` call imports
 * the BUILT dist by relative path (`scripts/db-migrate.mjs`'s own
 * docstring), which must exist and be current before it can run.
 */
export default async function setup(): Promise<() => Promise<void>> {
  run("pnpm", ["run", "typecheck"], "tsc -b — compiling every workspace package's dist/, including the migration runner");

  const { postgresUrl, stop } = await provisionPostgres();
  await mkdir(path.dirname(POSTGRES_HARNESS_INFO_PATH), { recursive: true });
  await writeFile(POSTGRES_HARNESS_INFO_PATH, JSON.stringify({ postgresUrl }, null, 2), "utf8");

  return async function teardown(): Promise<void> {
    stop();
    await rm(POSTGRES_HARNESS_INFO_PATH, { force: true });
  };
}
