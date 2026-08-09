import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFreePorts } from "../e2e/support/free-ports.js";

const CONTAINER_NAME = `hexdev-redis-test-${String(process.pid)}`;
const REDIS_TESTS_DIR = fileURLToPath(new URL(".", import.meta.url));

/** File-based handoff to every `*.redis.test.ts` file (same pattern as
 * `e2e/support/harness-info.ts`) — gitignored, run-scoped only. */
export const REDIS_HARNESS_INFO_PATH = path.join(REDIS_TESTS_DIR, ".harness", "info.json");

function run(command: string, args: string[], description: string): void {
  console.log(`[redis:setup] ${description}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`[redis:setup] FAILED (exit ${String(result.status)}): ${description}`);
}

/**
 * Polls `docker exec <container> redis-cli ping` rather than importing
 * `ioredis` directly: this file lives outside every workspace package (same
 * reasoning as `e2e/global-setup.ts` never importing an `@hexdev/*` package
 * directly — a top-level file has no workspace dependency to resolve one
 * from), and shelling out to the CLI already bundled in the `redis:7-alpine`
 * image needs no new dependency at all.
 */
async function waitForRedisReady(containerName: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = spawnSync("docker", ["exec", containerName, "redis-cli", "ping"], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim() === "PONG") return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`redis container ${containerName} never became ready within ${String(timeoutMs)}ms`);
}

/**
 * Starts ONE real Redis container for the whole `pnpm test:redis` run
 * (vitest's `globalSetup` contract: runs once, in the main CLI process,
 * before any test file) — the apply prompt's own bar: "the honest test is
 * two server processes sharing one Redis... a test asserting 'we called
 * redis.set' proves wiring, not scaling." `--rm` means Docker itself cleans
 * the container up on stop; teardown below also stops it explicitly so a
 * crashed run does not leave it behind either way.
 *
 * Also runs `tsc -b` here (once), matching `e2e/global-setup.ts`'s own
 * reasoning: `cross-instance.redis.test.ts` spawns real
 * `apps/server/dist/index.js` processes, which must exist and be current
 * before any spec file runs.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const [redisPort] = await getFreePorts(1);
  run(
    "docker",
    ["run", "-d", "--rm", "--name", CONTAINER_NAME, "-p", `${String(redisPort)}:6379`, "redis:7-alpine"],
    `starting Redis container ${CONTAINER_NAME} on port ${String(redisPort)}`,
  );
  await waitForRedisReady(CONTAINER_NAME, 20_000);

  run("pnpm", ["run", "typecheck"], "tsc -b — compiling every workspace package's dist/, including apps/server/dist/index.js");

  const redisUrl = `redis://127.0.0.1:${String(redisPort)}`;
  await mkdir(path.dirname(REDIS_HARNESS_INFO_PATH), { recursive: true });
  await writeFile(REDIS_HARNESS_INFO_PATH, JSON.stringify({ redisUrl }, null, 2), "utf8");

  console.log(`[redis:setup] Redis ready at ${redisUrl}`);

  return async function teardown(): Promise<void> {
    spawnSync("docker", ["stop", CONTAINER_NAME]);
    await rm(REDIS_HARNESS_INFO_PATH, { force: true });
  };
}
