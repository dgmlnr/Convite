import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFreePorts } from "./support/free-ports.js";
import { renderHostPage } from "./support/host-page.js";
import { HARNESS_INFO_PATH, type HarnessInfo } from "./support/harness-info.js";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Short and REAL (obs 2968: "the token expires before a human clicks").
 * Every join in this repo goes through `main.ts`'s `withFreshToken` — a
 * FRESH token minted immediately before the join, never the page-load
 * bootstrap token — so shortening the server's TTL for the whole e2e run
 * does not make the single-player/pairing specs racier; it just means every
 * spec exercises the renewal path, and the dedicated token-renewal spec can
 * prove the gap (obs 2968) with a genuinely short real wait instead of
 * either faking time or waiting the real production 120s.
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

async function waitForHttpReachable(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      await response.arrayBuffer();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`[e2e:setup] server never became reachable at ${url} within ${timeoutMs}ms: ${String(lastError)}`);
}

/**
 * Boots exactly what the e2e suite needs, ONCE for the whole `pnpm test:e2e`
 * run (vitest's `globalSetup` contract: runs in the main CLI process before
 * any test file, and its returned function runs once after every test file
 * finishes). Individual specs never build or boot anything themselves — they
 * only read `HARNESS_INFO_PATH` (see `support/harness-info.ts`) and drive
 * real browsers against the already-running system.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const [serverPort, hostPort] = await getFreePorts(2);
  const serverOrigin = `http://localhost:${String(serverPort)}`;
  const hostOrigin = `http://localhost:${String(hostPort)}`;
  const embedKey = "pk_e2e_local";

  const tenants = [
    {
      id: "e2e-tenant",
      embedKey,
      allowedOrigins: [hostOrigin],
      entitledGames: ["truco-argentino"],
    },
  ];

  // Practical trap (apply prompt): "Build both bundles BEFORE starting the
  // server. The server reads loader.js at boot; building after it starts
  // serves a stale 404." `tsc -b` first because both Vite builds resolve
  // their own workspace dependencies (e.g. widget-protocol, truco-ui) via
  // each package's compiled `dist/`, not the dev-only `@hexdev/source`
  // resolution condition.
  runBuildStep(["run", "typecheck"], process.env, "tsc -b — compiling every workspace package's dist/, including apps/server/dist/index.js");
  runBuildStep(
    ["--filter", "@hexdev/widget-sdk", "run", "build"],
    { ...process.env, HEXDEV_WIDGET_ORIGIN: serverOrigin },
    `building loader.js with HEXDEV_WIDGET_ORIGIN=${serverOrigin} baked in at build time`,
  );
  runBuildStep(["--filter", "@hexdev/widget-app", "run", "build"], process.env, "building widget-app.js");

  const serverEnv: NodeJS.ProcessEnv = { ...process.env };
  delete serverEnv.NODE_ENV; // never accidentally "production" in a throwaway e2e harness
  serverEnv.HEXDEV_ALLOW_DEV_DEFAULTS = "true"; // the literal string the server requires (apply prompt)
  serverEnv.HEXDEV_WIDGET_ORIGIN = serverOrigin;
  serverEnv.PORT = String(serverPort);
  serverEnv.HEXDEV_TENANTS_JSON = JSON.stringify(tenants);
  serverEnv.HEXDEV_SESSION_TTL_SECONDS = String(SESSION_TTL_SECONDS);

  console.log(`[e2e:setup] starting apps/server/dist/index.js on :${String(serverPort)}`);
  const serverProcess: ChildProcess = spawn("node", ["apps/server/dist/index.js"], {
    cwd: REPO_ROOT,
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverOutput = "";
  serverProcess.stdout?.on("data", (chunk: Buffer) => {
    serverOutput += chunk.toString();
  });
  serverProcess.stderr?.on("data", (chunk: Buffer) => {
    serverOutput += chunk.toString();
  });
  let serverExitedEarly = false;
  serverProcess.once("exit", (code) => {
    if (code !== null && code !== 0) {
      serverExitedEarly = true;
      console.error(`[e2e:setup] server process exited early (code ${String(code)}):\n${serverOutput}`);
    }
  });

  try {
    // /loader.js only proves the plain HTTP path of colyseus's own Express
    // app (registered via the `express` option, see server.ts) is up. The
    // real regression this closes — `gameServer.listen()` vs `httpServer.listen()`
    // — is a matchmake/WS-only gap; /loader.js being reachable does NOT
    // prove matchmake routes are bound, but `bindRoutes()` runs synchronously
    // inside the SAME `listen()` call before its callback fires, so by the
    // time the TCP socket accepts this request the matchmake routes already
    // exist too (see index.ts's own `gameServer.listen(...)` doc comment).
    // The single-player/pairing specs are the real, live proof of this: if
    // matchmaking ever hangs again, they are what will time out and fail.
    await waitForHttpReachable(`${serverOrigin}/loader.js`, 20_000);
  } catch (error) {
    throw new Error(`${String(error)}\nServer output so far:\n${serverOutput}`, { cause: error });
  }
  if (serverExitedEarly) {
    throw new Error(`[e2e:setup] server exited before becoming reachable:\n${serverOutput}`);
  }

  const hostServer: HttpServer = createHttpServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderHostPage(serverOrigin, embedKey));
  });
  await new Promise<void>((resolve, reject) => {
    hostServer.once("error", reject);
    hostServer.listen(hostPort, "127.0.0.1", () => resolve());
  });

  const info: HarnessInfo = { serverOrigin, hostOrigin, embedKey, sessionTtlSeconds: SESSION_TTL_SECONDS };
  await mkdir(path.dirname(HARNESS_INFO_PATH), { recursive: true });
  await writeFile(HARNESS_INFO_PATH, JSON.stringify(info, null, 2), "utf8");

  console.log(`[e2e:setup] ready — server ${serverOrigin}, host fixture ${hostOrigin}, session TTL ${String(SESSION_TTL_SECONDS)}s`);

  return async function teardown(): Promise<void> {
    console.log("[e2e:setup] tearing down");
    await new Promise<void>((resolve) => hostServer.close(() => resolve()));
    await new Promise<void>((resolve) => {
      if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
        resolve();
        return;
      }
      serverProcess.once("exit", () => resolve());
      serverProcess.kill("SIGTERM");
      setTimeout(() => {
        serverProcess.kill("SIGKILL");
        resolve();
      }, 5000);
    });
    await rm(HARNESS_INFO_PATH, { force: true });
  };
}
