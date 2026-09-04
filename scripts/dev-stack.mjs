/**
 * Runs the whole product — both roles, the proxy in front of them, and a
 * stand-in tenant page — at one address, so it can be opened by hand.
 *
 * WHY THIS EXISTS. After the mint/verify split, the front door (`/embed`,
 * `/session/renew`, `/loader.js`, `/assets/*`) lives in `apps/mint-server`
 * and colyseus lives in `apps/server`. Neither serves the other's paths, and
 * the widget builds its renewal url RELATIVE — so both roles have to answer
 * behind ONE origin, reached by path routing. That is the same topology
 * `e2e/support/system.ts` boots, and the routing table below is the same one
 * `e2e/support/front-proxy.ts` pins with its own test. A single-process run
 * is not a smaller version of the deployment; it is a different, broken one,
 * which is exactly what `dev:server` had silently become: it started only the
 * match role, so the front door it embedded answered 404.
 *
 * WHY IT BUILDS RATHER THAN ASSUMING A BUILD. `loader.js` bakes its target
 * origin in at BUILD time (`packages/widget-sdk/vite.config.ts`'s
 * `__HEXDEV_WIDGET_ORIGIN__` define). From another device `localhost` is
 * that device, so a loopback-baked bundle cannot work over the network no
 * matter how the server binds — and a bundle baked for a DIFFERENT address
 * than the one being served fails the same way, silently. Since only this
 * script knows which address it is about to serve, it owns the build too:
 * the baked origin and the served origin cannot drift apart because a human
 * ran the two halves in the wrong order.
 *
 * Usage:
 *   pnpm dev:server            # localhost only
 *   pnpm dev:lan               # detects this machine's LAN address
 *   pnpm dev:lan 10.0.0.5      # or name it explicitly
 *   pnpm dev:lan --no-build    # reuse the existing bundles as-is
 *
 * `dev:server` and `dev:lan` are the SAME stack at a different address, on
 * purpose: a local-only variant that boots a different topology than the one
 * shown on the network is how the two drift until only one of them works.
 *
 * Development affordance only, exactly like `dev-host.mjs`: it opts into the
 * dev key material via HEXDEV_ALLOW_DEV_DEFAULTS and is never part of a
 * deployment.
 *
 * ALSO PROVISIONS POSTGRES (tenant-administration slice 3b). Both roles'
 * `HEXDEV_TENANTS_JSON` fixture retired — their tenant catalogs now live in
 * Postgres, read through `HEXDEV_POSTGRES_URL`. This script starts its own
 * throwaway Postgres container (mirroring `postgres-tests/global-setup.ts`'s
 * `docker run` + `pg_isready` shape), applies migrations, and seeds one
 * working dev tenant before spawning either role — the honest new
 * prerequisite `pnpm dev:server` did not have before (README documents it).
 * `HEXDEV_POSTGRES_URL` set in the calling shell skips the container
 * entirely, the escape hatch design §14 names for a native Postgres install.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer, request } from "node:http";
import { connect, createServer as createTcpProbe } from "node:net";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildDevTenantSeed } from "./dev-tenant-seed.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The origin a browser on the network sees. Both roles answer here. */
const PUBLIC_PORT = 2567;
/** The stand-in tenant page. On the dev tenant's allowlist, see below. */
const HOST_PORT = 5173;
/** Internal only — nothing outside this machine ever talks to these. */
const MINT_PORT = 2570;
const MATCH_PORT = 2571;

/**
 * This machine's address on the actual local network.
 *
 * NOT simply "the first non-internal IPv4". A VPN interface — Tailscale and
 * friends hand out 100.64.0.0/10, which is carrier-grade NAT space, not
 * private space — is non-internal too, and whether it or the real NIC comes
 * first is just enumeration order. Picking it produces a demo that looks
 * fine here and is unreachable from the phone sitting on the same wifi, so
 * the RFC1918 ranges are preferred explicitly and CGNAT is excluded rather
 * than merely ranked below them.
 */
function isPrivateLanAddress(address) {
  const [a, b] = address.split(".").map(Number);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function detectLanAddress() {
  const candidates = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) candidates.push({ name, address: address.address });
    }
  }
  const lan = candidates.find((candidate) => isPrivateLanAddress(candidate.address));
  if (lan !== undefined) return lan.address;
  const listed = candidates.map((candidate) => `${candidate.name} (${candidate.address})`).join(", ");
  throw new Error(
    `No private LAN IPv4 address found${listed === "" ? "" : ` — saw only ${listed}`}. ` +
      "Pass one explicitly: pnpm dev:lan <address>",
  );
}

const args = process.argv.slice(2);
const skipBuild = args.includes("--no-build");
const lanAddress = args.find((arg) => !arg.startsWith("--")) ?? detectLanAddress();
const publicOrigin = `http://${lanAddress}:${String(PUBLIC_PORT)}`;
const hostOrigin = `http://${lanAddress}:${String(HOST_PORT)}`;

/** Shared `spawnSync` wrapper — loud on failure, one shape for every
 * subprocess step this script runs (build, migrations, docker). */
function run(command, commandArgs, description, envOverride) {
  process.stdout.write(`[dev-stack] ${description}\n`);
  const result = spawnSync(command, commandArgs, {
    cwd: REPO_ROOT,
    env: envOverride === undefined ? process.env : { ...process.env, ...envOverride },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`[dev-stack] FAILED (exit ${String(result.status)}): ${description}`);
}

/**
 * `tsc -b` first, then the bundles — the same order and the same reason
 * `e2e/global-setup.ts` documents: both Vite builds resolve their workspace
 * dependencies through each package's compiled `dist/`, so bundling before
 * compiling silently bundles the previous run's code.
 */
function build() {
  run("pnpm", ["run", "typecheck"], "compiling every workspace package's dist/", { HEXDEV_WIDGET_ORIGIN: publicOrigin });
  run("pnpm", ["-r", "build"], `baking ${publicOrigin} into loader.js`, { HEXDEV_WIDGET_ORIGIN: publicOrigin });
}

/** Program-generated, never from user input (threat: Subprocess) — same
 * discipline `postgres-tests/global-setup.ts`'s own `containerNameFor` and
 * `dockerRunArgs` document; duplicated in plain JS here rather than
 * imported because that file runs only through vite-node (vitest), and this
 * script runs through plain `node`. */
function devPostgresContainerName() {
  return `hexdev-dev-postgres-${String(process.pid)}`;
}

function dockerRunArgs(containerName, port) {
  return ["run", "-d", "--rm", "--name", containerName, "-p", `${String(port)}:5432`, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-e", "POSTGRES_DB=convite", "postgres:17-alpine"];
}

function ensureDockerAvailable() {
  const probe = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (probe.error || probe.status !== 0) {
    throw new Error(
      "pnpm dev:server needs Postgres and could not reach Docker to start one. Either install/start Docker " +
        "(Docker Desktop or the daemon), or point at an already-running Postgres yourself: " +
        "set HEXDEV_POSTGRES_URL=postgres://user:pass@host:port/db before running this command.",
    );
  }
}

async function waitForPostgresReady(containerName, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "postgres"], { encoding: "utf8" });
    if (result.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`postgres container ${containerName} never became ready within ${String(timeoutMs)}ms`);
}

/** An OS-assigned free TCP port, so this script's own throwaway container
 * never collides with a developer's own local Postgres on 5432 — the
 * `getFreePorts` role `postgres-tests/global-setup.ts` fills, reimplemented
 * here because that file is not importable from plain `node` (see the
 * header docstring). */
function getFreeTcpPort() {
  return new Promise((resolve, reject) => {
    const probe = createTcpProbe();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * `HEXDEV_POSTGRES_URL` set → use it, skip the container entirely (design
 * §14's escape hatch for a native install). Unset → start one throwaway,
 * ephemeral (`--rm`, no volume) container: a persistent one would let a
 * developer's stale local edits diverge from the seed, the exact class of
 * problem this whole slice removes.
 */
async function startDevPostgres() {
  const externalUrl = process.env.HEXDEV_POSTGRES_URL;
  if (externalUrl !== undefined) {
    process.stdout.write("[dev-stack] using HEXDEV_POSTGRES_URL as given, skipping the throwaway container\n");
    return { url: externalUrl, stop: () => {} };
  }
  ensureDockerAvailable();
  const port = await getFreeTcpPort();
  const containerName = devPostgresContainerName();
  run("docker", dockerRunArgs(containerName, port), `starting a throwaway Postgres container on :${String(port)}`);
  await waitForPostgresReady(containerName, 20_000);
  return { url: `postgres://postgres@127.0.0.1:${String(port)}/convite`, stop: () => spawnSync("docker", ["stop", containerName]) };
}

if (skipBuild) {
  process.stdout.write(`[build] skipped — serving whatever origin the existing bundles were built against\n`);
} else {
  build();
}

/**
 * Postgres now, before either role spawns (design §14: "after reaching
 * Postgres, before seeding and before spawning either role"). Both roles'
 * `HEXDEV_TENANTS_JSON` fixture retired this slice — the seed goes straight
 * into the same database both roles read.
 */
const { url: postgresUrl, stop: stopPostgres } = await startDevPostgres();
run("pnpm", ["run", "db:migrate"], "applying migrations to the dev database", { HEXDEV_POSTGRES_MIGRATE_URL: postgresUrl });

/**
 * The dev fixture tenant's identity. Not read off a `DEV_TENANT` fixture
 * anymore — that record retired with `HEXDEV_TENANTS_JSON` — so this script
 * now owns it directly. Matches `dev-host.mjs`'s own `pk_dev_local` default
 * so the stand-in page still works even if `HEXDEV_EMBED_KEY` is never set.
 */
const EMBED_KEY = "pk_dev_local";

/**
 * `entitledGames` sourced from the LIVE registry, never a fixture (design
 * §14): `MINT_GAME_IDS` is derived from the exact module list
 * `buildMintGameRegistry()` itself registers (`apps/mint-server/src/registry.ts`),
 * so this seed can never again show fewer games than the server is actually
 * ready to run — the drift the old, hand-copied `DEV_TENANT.entitledGames`
 * fixture once rotted into (see that retired file's own docstring, kept
 * here as the reason this import replaces it rather than a hand-written
 * list).
 */
const { MINT_GAME_IDS } = await import(pathToFileURL(path.join(REPO_ROOT, "apps/mint-server/dist/registry.js")).href);

const seed = buildDevTenantSeed({ id: "dev-tenant", embedKey: EMBED_KEY, hostOrigin, entitledGames: MINT_GAME_IDS });

const { connectPostgres } = await import(pathToFileURL(path.join(REPO_ROOT, "packages/platform-core/dist/postgres-client.js")).href);
const seedPool = await connectPostgres(postgresUrl);
try {
  // ON CONFLICT rather than a bare INSERT: the container is ephemeral and
  // starts empty on every run, but the `HEXDEV_POSTGRES_URL` escape hatch
  // above can point at a persistent database that already carries this
  // exact seed from a previous run.
  //
  // `valid_until` (migration 002, slice 5, task 5.10a): `buildDevTenantSeed`
  // already computed a far-future instant above — this is the ONLY write
  // path that ever needed a live database round trip, so passing it through
  // here rather than re-deriving it keeps the seed's own "now" argument the
  // single source of that value.
  await seedPool.query(
    `INSERT INTO tenants (id, embed_key, allowed_origins, entitled_games, valid_until)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (embed_key) DO UPDATE SET
       allowed_origins = EXCLUDED.allowed_origins,
       entitled_games  = EXCLUDED.entitled_games,
       valid_until     = EXCLUDED.valid_until,
       updated_at      = now()`,
    [seed.id, seed.embedKey, seed.allowedOrigins, seed.entitledGames, new Date(seed.validUntil)],
  );
} finally {
  await seedPool.end();
}

const roleEnv = {
  ...process.env,
  HEXDEV_ALLOW_DEV_DEFAULTS: "true",
  // The origin the widget's own page is served from — what the match role
  // re-validates the WebSocket join against. It is the PUBLIC origin, never
  // an internal port: the browser never sees those.
  HEXDEV_WIDGET_ORIGIN: publicOrigin,
  HEXDEV_POSTGRES_URL: postgresUrl,
};

/** Same split as `e2e/support/front-proxy.ts`, pinned by its own test there. */
function routesToMint(pathname) {
  return pathname === "/embed" || pathname === "/session/renew" || pathname === "/loader.js" || pathname.startsWith("/assets/");
}

function spawnRole(label, entry, port) {
  const child = spawn("node", [entry], {
    cwd: REPO_ROOT,
    env: { ...roleEnv, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = (stream) => (chunk) => {
    for (const line of String(chunk).split("\n").filter(Boolean)) stream.write(`[${label}] ${line}\n`);
  };
  child.stdout.on("data", prefix(process.stdout));
  child.stderr.on("data", prefix(process.stderr));
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`[${label}] exited with code ${String(code)} — shutting the rest down\n`);
      shutdown(1);
    }
  });
  return child;
}

/** Resolves once something is accepting connections, or rejects loudly. */
async function waitForPort(label, port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const reachable = await new Promise((resolve) => {
      const socket = connect(port, "127.0.0.1", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
      socket.setTimeout(500, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (reachable) return;
    if (Date.now() > deadline) {
      throw new Error(`${label} never started listening on :${String(port)} within ${String(timeoutMs)}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

const children = [];
let proxyServer;
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  proxyServer?.close();
  stopPostgres();
  setTimeout(() => process.exit(code), 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

children.push(spawnRole("mint", "apps/mint-server/dist/index.js", MINT_PORT));
children.push(spawnRole("match", "apps/server/dist/index.js", MATCH_PORT));

await waitForPort("mint role", MINT_PORT);
await waitForPort("match role", MATCH_PORT);

/**
 * Binds 0.0.0.0, unlike the e2e proxy's 127.0.0.1 — reaching this from
 * another device is the entire point here.
 */
proxyServer = createServer((clientReq, clientRes) => {
  const pathname = new URL(clientReq.url ?? "/", "http://localhost").pathname;
  const port = routesToMint(pathname) ? MINT_PORT : MATCH_PORT;
  const upstream = request({ host: "127.0.0.1", port, method: clientReq.method, path: clientReq.url, headers: clientReq.headers }, (upstreamRes) => {
    // Dev only: never let the browser hold a build you have replaced.
    //
    // The front door serves its assets with `cache-control: public,
    // max-age=300`, which is right for a deployment and actively misleading
    // here — after a rebuild the page keeps running the OLD bundle for up to
    // five minutes, so a change looks like it did not work, and worse, a
    // change that did not work can look like it did. Rewritten in the proxy
    // rather than in the server so production behaviour is untouched.
    clientRes.writeHead(upstreamRes.statusCode ?? 502, { ...upstreamRes.headers, "cache-control": "no-store" });
    upstreamRes.pipe(clientRes);
  });
  upstream.on("error", () => {
    if (!clientRes.headersSent) clientRes.writeHead(502);
    clientRes.end();
  });
  clientReq.pipe(upstream);
});

// Colyseus upgrades to a WebSocket after its HTTP matchmake call. Without
// this the page loads and the game then hangs the instant a match starts —
// the failure shape `front-proxy.ts` calls the worst one to debug.
proxyServer.on("upgrade", (req, clientSocket, head) => {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  const port = routesToMint(pathname) ? MINT_PORT : MATCH_PORT;
  const upstreamSocket = connect(port, "127.0.0.1", () => {
    const headerLines = Object.entries(req.headers).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`);
    upstreamSocket.write(`${req.method ?? "GET"} ${req.url ?? "/"} HTTP/1.1\r\n${headerLines.join("\r\n")}\r\n\r\n`);
    if (head.length > 0) upstreamSocket.write(head);
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  });
  const destroyBoth = () => {
    upstreamSocket.destroy();
    clientSocket.destroy();
  };
  upstreamSocket.on("error", destroyBoth);
  upstreamSocket.on("close", destroyBoth);
  clientSocket.on("error", destroyBoth);
  clientSocket.on("close", destroyBoth);
});

await new Promise((resolve, reject) => {
  proxyServer.once("error", reject);
  proxyServer.listen(PUBLIC_PORT, "0.0.0.0", () => resolve());
});

// The tenant fixture page, reusing the existing script rather than growing a
// second copy of it. It already binds every interface.
children.push(
  spawn("node", [path.join(REPO_ROOT, "scripts/dev-host.mjs"), String(HOST_PORT)], {
    cwd: REPO_ROOT,
    env: { ...process.env, HEXDEV_SERVER_ORIGIN: publicOrigin, HEXDEV_EMBED_KEY: EMBED_KEY },
    stdio: ["ignore", "inherit", "inherit"],
  }),
);

process.stdout.write(
  [
    "",
    lanAddress === "localhost" ? "  Convite is up." : "  Convite is up on the local network.",
    "",
    `    Open it at:          ${hostOrigin}`,
    `    Widget origin:       ${publicOrigin}  (mint :${String(MINT_PORT)} + match :${String(MATCH_PORT)} behind one port)`,
    `    Embed key:           ${EMBED_KEY}`,
    `    Postgres:            ${postgresUrl}`,
    "",
    "  Ctrl+C stops every process.",
    "",
  ].join("\n"),
);
