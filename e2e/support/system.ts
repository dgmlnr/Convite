import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { renderHostPage } from "./host-page.js";
import { readHarnessInfo } from "./harness-info.js";
import { getFreePorts } from "./free-ports.js";
import { startFrontProxy } from "./front-proxy.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

export interface SystemHandle {
  readonly serverOrigin: string;
  readonly hostOrigin: string;
  readonly embedKey: string;
  readonly sessionTtlSeconds: number;
  stop(): Promise<void>;
}

/**
 * Waits for a SUCCESSFUL response, not merely for one to arrive.
 *
 * The status check is the whole point and it was learned the hard way. This
 * function used to return on any fetch that did not throw, which worked only
 * because a not-yet-listening server refuses the connection outright. Put a
 * reverse proxy in front — which the two-role topology requires — and the
 * proxy answers 502 the instant its upstream is still booting. The harness
 * then declared the system ready against its own error page, every request
 * the browser made 502'd, and the failure surfaced minutes later as an
 * iframe that never became visible, with no server output to explain it.
 *
 * A readiness probe that accepts an error response is not a readiness probe.
 */
async function waitForHttpReachable(url: string, timeoutMs: number, describeFailure: () => string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastProblem = "never attempted";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      await response.arrayBuffer();
      if (response.ok) return;
      lastProblem = `responded ${String(response.status)}`;
    } catch (error) {
      lastProblem = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`never became reachable at ${url} within ${String(timeoutMs)}ms (${lastProblem})\n${describeFailure()}`);
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
  /** Additive, opt-in only (2v2's own e2e spec passes `["truco-argentino-2v2"]`
   * here) — every existing e2e spec omits this and gets the EXACT SAME
   * `entitledGames: ["truco-argentino"]` tenant as before this option
   * existed, byte for byte. */
  readonly extraEntitledGames?: readonly string[];
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
      entitledGames: ["truco-argentino", ...(options.extraEntitledGames ?? [])],
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

  // TWO ROLES, ONE ORIGIN — the deployment shape the mint/verify split
  // requires, not a harness convenience. The widget was built against
  // `info.serverOrigin` and builds its `/session/renew` url RELATIVE to
  // whatever origin served its page, so both roles have to answer there.
  // `front-proxy.ts` carries the full argument.
  //
  // The roles listen on ephemeral ports of their own; only the proxy binds
  // the origin the browser knows.
  const [mintPort, matchPort] = await getFreePorts(2);
  const mintOrigin = `http://localhost:${String(mintPort)}`;
  const matchOrigin = `http://localhost:${String(matchPort)}`;

  // The roles get DIFFERENT key material, which is the split itself: the
  // mint role keeps the seed (its own dev default, via
  // HEXDEV_ALLOW_DEV_DEFAULTS above) and the match role is given only the
  // public half. Neither is spelled out here — each role's config supplies
  // its own dev default, and the match role's default is the public key of
  // the mint role's default seed, so the pair stays consistent by
  // construction rather than by a constant duplicated in this harness.
  const mintEnv: NodeJS.ProcessEnv = { ...serverEnv, PORT: String(mintPort) };
  const matchEnv: NodeJS.ProcessEnv = { ...serverEnv, PORT: String(matchPort) };

  let serverOutput = "";
  const collect = (role: string) => (chunk: Buffer) => {
    serverOutput += `[${role}] ${chunk.toString()}`;
  };
  let serverExitedEarly = false;
  const watchExit = (role: string) => (code: number | null) => {
    if (code !== null && code !== 0) {
      serverExitedEarly = true;
      serverOutput += `[${role}] exited with code ${String(code)}\n`;
    }
  };

  const spawnRole = (role: string, entry: string, env: NodeJS.ProcessEnv): ChildProcess => {
    const child = spawn("node", [entry], { cwd: REPO_ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout?.on("data", collect(role));
    child.stderr?.on("data", collect(role));
    child.once("exit", watchExit(role));
    return child;
  };

  const mintProcess = spawnRole("mint", "apps/mint-server/dist/index.js", mintEnv);
  const serverProcess: ChildProcess = spawnRole("match", "apps/server/dist/index.js", matchEnv);

  // BOTH roles, not just the one an HTTP probe happens to reach.
  //
  // The first version of this waited only on `/loader.js` through the proxy,
  // and `/loader.js` routes to the MINT role — so the match role was never
  // checked at all. A spec that starts a match immediately would then hit the
  // proxy while colyseus was still booting, which is the 502-or-hang shape
  // `front-proxy.ts` itself calls the worst one to debug, because it reads as
  // a broken game rather than a broken harness.
  //
  // Each role's own "listening on" line is the signal, rather than an HTTP
  // request, for two reasons: it is protocol-independent, so it works for the
  // colyseus role which has no plain GET worth probing; and it survives the
  // next unit, where the match role stops serving the front door entirely and
  // any path-based probe against it would quietly start passing for the wrong
  // reason.
  const waitForRoleListening = async (role: string, port: number): Promise<void> => {
    const deadline = Date.now() + 20_000;
    const marker = `listening on :${String(port)}`;
    while (Date.now() < deadline) {
      if (serverOutput.includes(marker)) return;
      if (serverExitedEarly) throw new Error(`the ${role} role exited before it started listening:\n${serverOutput}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`the ${role} role never reported listening on :${String(port)} within 20000ms:\n${serverOutput}`);
  };

  // Anything that throws from here on has already spawned processes, so it
  // has to take them with it. Without this, a failure between spawning and
  // returning leaks BOTH roles — strictly worse than the single process that
  // could leak before this file grew a second one.
  let proxy: { stop(): Promise<void> } | undefined;
  try {
    await Promise.all([waitForRoleListening("mint", mintPort), waitForRoleListening("match", matchPort)]);
    proxy = await startFrontProxy({ port: serverPort, mintOrigin, matchOrigin });
    // Now that both upstreams are up, this proves the ROUTING — the part no
    // amount of waiting on the roles themselves can establish.
    await waitForHttpReachable(`${info.serverOrigin}/loader.js`, 20_000, () => `role output so far:\n${serverOutput}`);
  } catch (error) {
    await proxy?.stop();
    mintProcess.kill("SIGKILL");
    serverProcess.kill("SIGKILL");
    throw error;
  }

  const hostServer: HttpServer = createHttpServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderHostPage(info.serverOrigin, info.embedKey));
  });
  await new Promise<void>((resolve, reject) => {
    hostServer.once("error", reject);
    hostServer.listen(hostPort, "127.0.0.1", () => resolve());
  });

  // Every spec file starts its own system, so anything left running here
  // leaks into the next file — and a leaked listener on an ephemeral port
  // surfaces later as an unrelated spec failing to bind. Both roles and the
  // proxy are torn down, not just the one that used to exist.
  const stopProcess = (child: ChildProcess): Promise<void> =>
    new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
      setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5000);
    });

  const stop = async (): Promise<void> => {
    await new Promise<void>((resolve) => hostServer.close(() => resolve()));
    await proxy?.stop();
    await Promise.all([stopProcess(serverProcess), stopProcess(mintProcess)]);
  };

  return { serverOrigin: info.serverOrigin, hostOrigin: info.hostOrigin, embedKey: info.embedKey, sessionTtlSeconds: info.sessionTtlSeconds, stop };
}
