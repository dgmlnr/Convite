import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
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
 * THE SSLRequest, WHICH IS THE SHORTEST COMPLETE THING A POSTGRES SERVER
 * ANSWERS: an Int32 length of 8, then the fixed request code 80877103
 * (`1234 << 16 | 5679`). It is sent before any startup packet, so it needs no
 * user, no database and no credentials, and the reply is exactly ONE byte.
 *
 * Pure and exported so `global-setup.test.ts` can pin the wire bytes without
 * touching Docker, the same reason `containerNameFor` and `dockerRunArgs`
 * above are.
 */
export function sslRequestMessage(): Buffer {
  const message = Buffer.alloc(8);
  message.writeInt32BE(8, 0);
  message.writeInt32BE(80877103, 4);
  return message;
}

/**
 * `S` (willing to negotiate TLS) or `N` (built without it — what
 * `postgres:17-alpine` answers) are the ONLY two replies to the message
 * above, and either one proves a real Postgres is on the other end. Anything
 * else — no bytes at all, a reset, a proxy that accepted and hung up — is not
 * a server, which is the whole distinction this file got wrong before.
 */
export function isPostgresGreeting(reply: Buffer): boolean {
  return reply.length > 0 && (reply[0] === 0x53 || reply[0] === 0x4e);
}

/**
 * ONE HANDSHAKE FROM THE HOST, WHICH IS WHERE EVERY LATER CONNECTION COMES
 * FROM. Exported for `global-setup.test.ts`, which points it at plain
 * `node:net` servers — no Docker — to prove both verdicts.
 *
 * A BARE TCP CONNECT IS NOT ENOUGH and that is measured, not assumed: with
 * Docker's userland proxy the host port is bound the instant the container
 * starts, so `connect` succeeds long before anything is listening inside.
 * Sampling a starting container every 50ms, the host saw `connect` succeed
 * and then the socket end with zero bytes — `end-without-data` — while the
 * container was still initialising. Only reading a reply tells the two apart.
 */
export async function postgresAnswersOn(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host, port });
    let settled = false;
    const finish = (answered: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(answered);
    };
    socket.setTimeout(timeoutMs, () => {
      finish(false);
    });
    socket.on("connect", () => {
      socket.write(sslRequestMessage());
    });
    socket.on("data", (reply: Buffer) => {
      finish(isPostgresGreeting(reply));
    });
    socket.on("error", () => {
      finish(false);
    });
    socket.on("end", () => {
      finish(false);
    });
    socket.on("close", () => {
      finish(false);
    });
  });
}

/**
 * POLLS FROM THE HOST, ON THE MAPPED PORT — the address `db:migrate` and every
 * spec file will use — rather than `docker exec <container> pg_isready`, and
 * the difference is a real race this harness lost twice in a row.
 *
 * MEASURED, by sampling both probes against a starting `postgres:17-alpine`
 * every 50ms: `docker exec pg_isready` reported READY at 960ms and again at
 * 1046ms, while the host got `ECONNRESET`/`end-without-data` at both instants
 * and only got a real reply at 1239ms — a 279ms window in which this function
 * used to return and hand a URL nothing was listening on yet. The cause is in
 * the image's own entrypoint: `initdb` runs a TEMPORARY server with
 * `listen_addresses=''`, reachable on the container's unix socket (so
 * `pg_isready` inside says yes) and on no TCP address at all (so the host
 * says no). At 1133ms `pg_isready` went back to saying no — that temporary
 * server shutting down before the real one came up.
 *
 * STILL NO `pg` DEPENDENCY, which was the original reason for shelling out:
 * this file lives outside every workspace package (`postgres-tests` is not a
 * pnpm workspace member — same reasoning as `redis-tests/global-setup.ts`
 * never importing `ioredis`). `node:net` plus the eight bytes above needs no
 * package at all, one fewer than `docker exec` did.
 */
async function waitForPostgresReady(host: string, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await postgresAnswersOn(host, port, 1_000)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`nothing answered the Postgres protocol on ${host}:${String(port)} within ${String(timeoutMs)}ms`);
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

  /**
   * FROM HERE ON, EVERY EXIT STOPS THE CONTAINER. Before this, a wait that
   * timed out or a migration that failed threw straight out of `setup()` and
   * left `hexdev-postgres-test-<pid>` running: `--rm` only fires when the
   * container stops, and nothing was stopping it. The residue is not
   * cosmetic — a stale `hexdev-postgres-test-*` is one of the two containers
   * AGENTS.md records as making a LATER run fail in an unrelated place.
   */
  const stop = (): void => {
    spawnSync("docker", ["stop", containerName]);
  };
  try {
    await waitForPostgresReady("127.0.0.1", port, 20_000);

    const postgresUrl = `postgres://postgres@127.0.0.1:${String(port)}/convite`;
    run("pnpm", ["run", "db:migrate"], "applying migrations against the fresh test database", { HEXDEV_POSTGRES_MIGRATE_URL: postgresUrl });
    console.log(`[postgres:setup] Postgres ready at ${postgresUrl}, migrations applied`);

    return { postgresUrl, stop };
  } catch (failure) {
    stop();
    throw failure;
  }
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
