import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { renderHostPage } from "./host-page.js";
import { readHarnessInfo } from "./harness-info.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

export interface SystemHandle {
  readonly serverOrigin: string;
  readonly hostOrigin: string;
  readonly embedKey: string;
  readonly sessionTtlSeconds: number;
  stop(): Promise<void>;
}

async function waitForHttpReachable(url: string, timeoutMs: number, describeFailure: () => string): Promise<void> {
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
  throw new Error(`server never became reachable at ${url} within ${String(timeoutMs)}ms: ${String(lastError)}\n${describeFailure()}`);
}

/**
 * Starts a FRESH, isolated server process + host-fixture server for exactly
 * one spec file, and returns a `stop()` to tear both down. Real-run
 * discovery, not assumed up front: an earlier version of this harness booted
 * ONE server process and shared it across every spec file for the whole
 * `pnpm test:e2e` run. That shared process accumulated real in-memory
 * server-side state between files — leftover matchmaking-pool/presence
 * entries and Colyseus rooms left in their 30s reconnection window by a
 * spec's own abrupt `context.close()` — which reproducibly stalled a LATER
 * file's own real match (confirmed: running only `pairing` immediately
 * before `single-player` against a shared server made `single-player`'s
 * match freeze at 0 points for 340+ real seconds, 100% of the time; the same
 * spec run alone against a fresh server passed in under 30s, every time). A
 * process boundary per file is the actual fix — each file's Colyseus room
 * registry, matchmaking pool, rate limiters, and replay guard now start
 * genuinely empty, so no spec's cleanup (or lack of one — there is
 * deliberately no mid-match "leave" affordance in the UI yet, a disclosed
 * gap) can affect another spec's outcome.
 *
 * The port/origin/embed key/TTL are NOT re-chosen per call: they come from
 * `harness-info.ts`, written once by `global-setup.ts` alongside the ONE
 * build of `loader.js` (which bakes its target origin in at build time —
 * rebuilding it per file would be wasted work for no isolation benefit,
 * since the port number itself carries no state).
 */
export interface StartSystemOptions {
  /** Design §10 PRIMARY theming path: configures the e2e tenant's own
   * `TenantRecord.theme`, exactly like a real `HEXDEV_TENANTS_JSON` deploy
   * value would. `undefined` (the default every OTHER e2e spec uses)
   * reproduces today's unthemed tenant exactly — every existing spec stays
   * a live regression proof that theming is genuinely optional. */
  readonly tenantTheme?: Readonly<Record<string, string>>;
}

export async function startSystem(options: StartSystemOptions = {}): Promise<SystemHandle> {
  const info = readHarnessInfo();
  const serverPort = Number(new URL(info.serverOrigin).port);
  const hostPort = Number(new URL(info.hostOrigin).port);

  const tenants = [
    {
      id: "e2e-tenant",
      embedKey: info.embedKey,
      allowedOrigins: [info.hostOrigin],
      entitledGames: ["truco-argentino"],
      theme: options.tenantTheme,
    },
  ];

  const serverEnv: NodeJS.ProcessEnv = { ...process.env };
  delete serverEnv.NODE_ENV; // never accidentally "production" in a throwaway e2e harness
  serverEnv.HEXDEV_ALLOW_DEV_DEFAULTS = "true"; // the literal string the server requires
  serverEnv.HEXDEV_WIDGET_ORIGIN = info.serverOrigin;
  serverEnv.PORT = String(serverPort);
  serverEnv.HEXDEV_TENANTS_JSON = JSON.stringify(tenants);
  serverEnv.HEXDEV_SESSION_TTL_SECONDS = String(info.sessionTtlSeconds);

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
    if (code !== null && code !== 0) serverExitedEarly = true;
  });

  await waitForHttpReachable(`${info.serverOrigin}/loader.js`, 20_000, () => `server output so far:\n${serverOutput}`);
  if (serverExitedEarly) {
    throw new Error(`server exited before becoming reachable:\n${serverOutput}`);
  }

  const hostServer: HttpServer = createHttpServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderHostPage(info.serverOrigin, info.embedKey));
  });
  await new Promise<void>((resolve, reject) => {
    hostServer.once("error", reject);
    hostServer.listen(hostPort, "127.0.0.1", () => resolve());
  });

  const stop = async (): Promise<void> => {
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
  };

  return { serverOrigin: info.serverOrigin, hostOrigin: info.hostOrigin, embedKey: info.embedKey, sessionTtlSeconds: info.sessionTtlSeconds, stop };
}
