import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFreePorts } from "./support/free-ports.js";
import { HARNESS_INFO_PATH, type HarnessInfo } from "./support/harness-info.js";
import { provisionPostgres } from "../postgres-tests/global-setup.js";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Short and REAL (obs 2968: "the token expires before a human clicks").
 * Every join in this repo goes through `main.ts`'s `withFreshToken` — a
 * FRESH token minted immediately before the join, never the page-load
 * bootstrap token — so a short server TTL does not make the
 * single-player/pairing specs racier; it just means every spec exercises the
 * renewal path, and the dedicated token-renewal spec can prove the gap (obs
 * 2968) with a genuinely short real wait instead of either faking time or
 * waiting the real production 120s.
 */
const SESSION_TTL_SECONDS = 6;

function runBuildStep(args: string[], env: NodeJS.ProcessEnv, description: string): void {
  console.log(`[e2e:setup] ${description}`);
  const result = spawnSync("pnpm", args, { cwd: REPO_ROOT, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`[e2e:setup] FAILED (exit ${String(result.status)}): ${description}`);
  }
}

/**
 * Builds both bundles ONCE for the whole `pnpm test:e2e` run (vitest's
 * `globalSetup` contract: runs in the main CLI process before any test
 * file). Deliberately does NOT start the server or the host fixture here
 * anymore — see `support/system.ts`'s own doc comment for why: each spec
 * file now boots its OWN, fully isolated server process (same port/origin,
 * fresh in-memory state) via `startSystem()` in its own `beforeAll`.
 *
 * Practical trap (apply prompt): "Build both bundles BEFORE starting the
 * server. The server reads loader.js at boot; building after it starts
 * serves a stale 404." `tsc -b` first because both Vite builds resolve their
 * own workspace dependencies (e.g. widget-protocol, truco-ui) via each
 * package's compiled `dist/`, not the dev-only `@hexdev/source` resolution
 * condition. The server port is chosen HERE, once, because the loader
 * bakes its target origin in at BUILD time — every spec file's own server
 * process reuses this exact port (see `system.ts`), never a freshly
 * re-baked loader per file.
 *
 * ALSO PROVISIONS POSTGRES ONCE for the whole run (tenant-administration
 * PR4e, closing the gap PR4d's own apply-progress disclosed rather than
 * silently left broken). Both roles' `HEXDEV_TENANTS_JSON` fixture retired
 * in PR4a/PR4b — their tenant catalogs live in Postgres now, so this harness
 * needs a real database to hand them, exactly like `pnpm dev:server`
 * (`scripts/dev-stack.mjs`) already needs one. Reuses
 * `postgres-tests/global-setup.ts`'s own `provisionPostgres()` rather than
 * inventing a second CI-branch/local-Docker mechanism: locally it starts a
 * fresh throwaway Docker container (same as `pnpm run test:postgres`); in
 * CI it connects to the `end to end` job's own `services:` Postgres
 * container via `HEXDEV_TEST_POSTGRES_URL` (`.github/workflows/ci.yml`,
 * mirroring the `postgres` job's identical shape). Either way, every
 * migration is applied before any spec file runs. The connection string is
 * NOT stored as an env var for the roles here — it rides in `HarnessInfo`
 * instead, because each spec file's own `startSystem()` (not this file)
 * seeds the actual fixture tenant row and decides both roles' env per call
 * (see `system.ts`'s own doc comment for why that has to happen per spec
 * file, not once here).
 */
export default async function setup(): Promise<() => Promise<void>> {
  const [serverPort, hostPort] = await getFreePorts(2);
  const serverOrigin = `http://localhost:${String(serverPort)}`;
  const hostOrigin = `http://localhost:${String(hostPort)}`;
  const embedKey = "pk_e2e_local";

  runBuildStep(["run", "typecheck"], process.env, "tsc -b — compiling every workspace package's dist/, including apps/server/dist/index.js");
  runBuildStep(
    ["--filter", "@hexdev/widget-sdk", "run", "build"],
    { ...process.env, HEXDEV_WIDGET_ORIGIN: serverOrigin },
    `building loader.js with HEXDEV_WIDGET_ORIGIN=${serverOrigin} baked in at build time`,
  );
  runBuildStep(["--filter", "@hexdev/widget-app", "run", "build"], process.env, "building widget-app.js");

  const { postgresUrl, stop: stopPostgres } = await provisionPostgres();

  const info: HarnessInfo = { serverOrigin, hostOrigin, embedKey, sessionTtlSeconds: SESSION_TTL_SECONDS, postgresUrl };
  await mkdir(path.dirname(HARNESS_INFO_PATH), { recursive: true });
  await writeFile(HARNESS_INFO_PATH, JSON.stringify(info, null, 2), "utf8");

  console.log(
    `[e2e:setup] bundles built — server origin will be ${serverOrigin}, host fixture origin will be ${hostOrigin}, ` +
      `Postgres ready at ${postgresUrl} (each spec file starts its own process and seeds its own tenant row)`,
  );

  return async function teardown(): Promise<void> {
    stopPostgres();
    await rm(HARNESS_INFO_PATH, { force: true });
  };
}
