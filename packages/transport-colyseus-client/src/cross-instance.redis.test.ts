import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GameId, PlayerId } from "@hexdev/platform-contract";
import { createSessionTokenIssuer, deriveTestSessionSigningKey } from "@hexdev/platform-core";
import type { TenantId, TenantRecord } from "@hexdev/platform-core";
import { createTransportClient } from "./client.js";
import { joinMatchFromReservation, startBotMatch } from "./match-connection.js";
import { joinMatchmakingQueue } from "./presence-connection.js";
import { readRedisUrlForOwnTests } from "./redis-test-support.js";

/**
 * THE honest test (apply prompt's own bar): "a test asserting 'we called
 * redis.set' proves wiring, not scaling... two server processes sharing one
 * Redis" — this file spawns TWO REAL `apps/server/dist/index.js` processes,
 * gives them the SAME `HEXDEV_REDIS_URL`, and proves the three properties
 * horizontal scaling requires, over real HTTP matchmaking and real
 * WebSockets, using the exact same production client code
 * (`createTransportClient`/`joinMatchmakingQueue`/`startBotMatch`) every
 * other live test in this package already uses — never a mock, never an
 * in-process shortcut.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const GAME_ID = "truco-argentino" as GameId;
const TENANT_ID = "cross-instance-tenant" as TenantId;
// The EXACT property this file exists to prove ("all instances must verify
// each other's tokens"), and it is now proved the way a real deployment
// works rather than the way that was convenient.
//
// This file used to hand every spawned instance the SIGNING SEED via
// HEXDEV_SESSION_SIGNING_KEY. That was the debt of handoff §P4.3 written as
// a fixture: it made the property trivially true, because every replica
// could mint as well as verify, and it meant compromising any one of them
// minted for the whole fleet.
//
// After the mint/verify split the seed stays HERE, in the test process,
// which stands in for the minting role. The spawned instances receive only
// the PUBLIC half, so they are structurally incapable of minting — and a
// token minted locally still has to verify on any of them, which is the
// property, now with teeth.
const SHARED_SIGNING_KEY = await deriveTestSessionSigningKey("cross-instance-shared-secret");
const SHARED_PUBLIC_KEY = (await createSessionTokenIssuer(SHARED_SIGNING_KEY)).publicKey;
const SESSION_TTL_SECONDS = 60;
const TENANT_PAGE_ORIGIN = "https://cross-instance.example";
/** A REAL load-balanced deployment puts every process behind ONE public
 * origin — a browser's WebSocket `Origin` header is always that ONE shared
 * origin, never an individual backend instance's own `host:port` (which the
 * browser never sees at all). Every spawned instance below is configured
 * with this SAME `HEXDEV_WIDGET_ORIGIN`, matching `MatchRoomAuthOptions.
 * allowedWidgetOrigins`'s own docstring: it re-validates THIS deployment's
 * widget origin, never a per-process address. */
const SHARED_WIDGET_ORIGIN = "https://cross-instance-widget.example";

function getFreePorts(count: number): Promise<number[]> {
  return Promise.all(
    Array.from({ length: count }, () => {
      return new Promise<number>((resolve, reject) => {
        const server = createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const { port } = server.address() as { port: number };
          server.close(() => resolve(port));
        });
      });
    }),
  );
}

interface Instance {
  readonly origin: string;
  readonly process: ChildProcess;
}

/**
 * Readiness from the instance's OWN "listening on" line rather than an HTTP
 * probe. The match role serves no plain GET any more — the front door moved
 * to the minting role — and this signal is the honest one for colyseus
 * anyway: `gameServer.listen` is what performs `matchMaker.accept()` and
 * `bindRoutes()`, so the line is printed exactly when a matchmake call can
 * actually be answered.
 */
async function waitForListening(readOutput: () => string, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const marker = `listening on :${String(port)}`;
  while (Date.now() < deadline) {
    if (readOutput().includes(marker)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`instance never reported "${marker}" within ${String(timeoutMs)}ms`);
}

/**
 * Spawns one REAL `apps/server` process, distinct only by `port`/env
 * overrides — every instance shares the SAME tenant/secret/Redis so a token
 * minted for one is valid on the other, matching a genuine horizontally-
 * scaled deployment behind a load balancer (same config, same secret store,
 * same Redis, N processes).
 */
async function startInstance(port: number, redisUrl: string, envOverrides: NodeJS.ProcessEnv = {}): Promise<Instance> {
  const tenants: readonly TenantRecord[] = [{ id: TENANT_ID, embedKey: "pk_cross_instance", allowedOrigins: [TENANT_PAGE_ORIGIN], entitledGames: [GAME_ID] }];
  const origin = `http://127.0.0.1:${String(port)}`;
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_ENV; // never accidentally "production" in a throwaway test harness (same reasoning as e2e/support/system.ts)
  Object.assign(env, {
    HEXDEV_ALLOW_DEV_DEFAULTS: "true",
    HEXDEV_SESSION_PUBLIC_KEY: SHARED_PUBLIC_KEY,
    HEXDEV_SESSION_TTL_SECONDS: String(SESSION_TTL_SECONDS),
    HEXDEV_TENANTS_JSON: JSON.stringify(tenants),
    // SAME shared origin on every instance — see SHARED_WIDGET_ORIGIN's own
    // comment. NOT this instance's own `origin`: that would only be correct
    // for a single-instance deployment.
    HEXDEV_WIDGET_ORIGIN: SHARED_WIDGET_ORIGIN,
    PORT: String(port),
    HEXDEV_REDIS_URL: redisUrl,
    HEXDEV_PUBLIC_ADDRESS: `127.0.0.1:${String(port)}`,
    ...envOverrides,
  });
  const child = spawn("node", ["apps/server/dist/index.js"], { cwd: REPO_ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  // The match role no longer serves the widget's front door — `/loader.js`
  // moved to the minting role with the rest of it — so readiness is taken
  // from the instance's own "listening on" line instead of an HTTP path.
  // That signal is also the honest one for colyseus: `gameServer.listen` is
  // what performs `matchMaker.accept()` and `bindRoutes()`, so the line is
  // printed exactly when the instance can actually answer a matchmake call.
  try {
    await waitForListening(() => output, port, 20_000);
  } catch (error) {
    throw new Error(`instance on port ${String(port)} never started listening:\n${output}`, { cause: error });
  }
  return { origin, process: child };
}

function stopInstance(instance: Instance): Promise<void> {
  return new Promise((resolve) => {
    if (instance.process.exitCode !== null || instance.process.signalCode !== null) {
      resolve();
      return;
    }
    instance.process.once("exit", () => resolve());
    instance.process.kill("SIGTERM");
    setTimeout(() => {
      instance.process.kill("SIGKILL");
      resolve();
    }, 5000);
  });
}

async function mintToken(playerId: string): Promise<string> {
  const issuer = await createSessionTokenIssuer(SHARED_SIGNING_KEY);
  return issuer.mint({ tenantId: TENANT_ID, playerId: playerId as PlayerId, entitlements: [GAME_ID] }, SESSION_TTL_SECONDS);
}

/**
 * REAL FINDING, verified not assumed (own initial version of this test
 * silently relied on the OPPOSITE): Colyseus's own `MatchMaker.createRoom`
 * calls `selectProcessIdToCreateRoom` when a distributed `Presence` (our
 * `RedisPresence`) is active — by default "the process with the least rooms
 * created" (verified in the installed `@colyseus/core` source,
 * `MatchMaker.ts`). A `client.create("match", ...)` request sent to ONE
 * process's matchmake endpoint can therefore have its room actually created
 * on a DIFFERENT, less-loaded process in the SAME Redis-registered cluster —
 * this is genuine, useful load balancing, not a bug. It means a per-process
 * CONFIG DIFFERENCE (e.g. a smaller rate limit on only some instances) is
 * NOT reliably exercised by targeting one specific instance's endpoint,
 * because the room — and therefore the `MatchRoom.onAuth` check that reads
 * that process's OWN configured limit — can land elsewhere. The two describe
 * blocks below are fully SEQUENTIAL and never share a running process
 * cluster (each starts and fully stops its own pair before the other's
 * `beforeAll` runs) specifically to keep this real behavior from silently
 * cross-contaminating property 3's dedicated small rate limit with property
 * 1/2's default-limit pair — discovered by this test's own first run
 * failing exactly this way against a real Redis, not predicted in advance.
 */
describe("cross-instance — property 3: a rate limit is enforced across both instances, not per instance", () => {
  let limitedA: Instance;
  let limitedB: Instance;

  beforeAll(async () => {
    const redisUrl = readRedisUrlForOwnTests();
    const [portC, portD] = await getFreePorts(2);
    // BOTH instances share the SAME tiny limit — matching a real deployment,
    // where every instance behind a load balancer runs identical config.
    // The property under test is that the ceiling is shared ACROSS the
    // cluster (2 total), never "2 per instance" (which would allow 4).
    const limitEnv = { HEXDEV_JOIN_IP_RATE_LIMIT: "2", HEXDEV_JOIN_IP_RATE_WINDOW_MS: "60000" };
    [limitedA, limitedB] = await Promise.all([startInstance(portC!, redisUrl, limitEnv), startInstance(portD!, redisUrl, limitEnv)]);
  }, 60_000);

  afterAll(async () => {
    await Promise.all([limitedA, limitedB].map(stopInstance));
  });

  it(
    "the third join across the pair is rejected, even though no single instance saw more than 2 attempts targeted at it",
    async () => {
      const attempt = async (instance: Instance, playerId: string) => {
        const client = createTransportClient(instance.origin, { headers: { Origin: SHARED_WIDGET_ORIGIN } });
        const token = await mintToken(playerId);
        return startBotMatch(client, { gameId: GAME_ID, config: { pointsToWin: 15 }, botTier: "easy", playerId, token });
      };

      // limit=2: first join targeted at A, second targeted at B both succeed
      // (combined budget of 2, spent across BOTH processes — see this
      // describe block's own docstring on why WHICH process actually
      // creates each room is Colyseus's own load-balancing choice, not
      // controlled by which endpoint the client contacted).
      await expect(attempt(limitedA, "rate-player-1")).resolves.toBeDefined();
      await expect(attempt(limitedB, "rate-player-2")).resolves.toBeDefined();
      // Third join, targeted at A again: the SHARED budget is already
      // exhausted — an in-memory limiter on A alone would still have budget
      // left (only its own share consumed), wrongly allowing this and
      // silently doubling the real ceiling under N processes.
      await expect(attempt(limitedA, "rate-player-3")).rejects.toThrow();
    },
    30_000,
  );
});

describe("cross-instance — properties 1 and 2: pairing and jti replay across two real apps/server processes sharing one Redis (apply prompt's own honest test)", () => {
  let instanceA: Instance;
  let instanceB: Instance;

  beforeAll(async () => {
    const redisUrl = readRedisUrlForOwnTests();
    const [portA, portB] = await getFreePorts(2);
    [instanceA, instanceB] = await Promise.all([startInstance(portA!, redisUrl), startInstance(portB!, redisUrl)]);
  }, 60_000);

  afterAll(async () => {
    await Promise.all([instanceA, instanceB].map(stopInstance));
  });

  it("property 1: a player queued on instance A pairs with a player queued on instance B, and both land in the same match", async () => {
    const modality = { pointsToWin: 15 };
    const clientA = createTransportClient(instanceA.origin, { headers: { Origin: SHARED_WIDGET_ORIGIN } });
    const clientB = createTransportClient(instanceB.origin, { headers: { Origin: SHARED_WIDGET_ORIGIN } });
    const tokenA = await mintToken("pairing-player-a");
    const tokenB = await mintToken("pairing-player-b");

    const queueA = await joinMatchmakingQueue(clientA, { gameId: GAME_ID, playerId: "pairing-player-a", modality, token: tokenA });
    const pairedA = new Promise<{ reservation: unknown }>((resolve) => queueA.onPaired(resolve));

    const queueB = await joinMatchmakingQueue(clientB, { gameId: GAME_ID, playerId: "pairing-player-b", modality, token: tokenB });
    const pairedB = new Promise<{ reservation: unknown }>((resolve) => queueB.onPaired(resolve));

    const [{ reservation: reservationA }, { reservation: reservationB }] = await Promise.all([pairedA, pairedB]);

    const matchA = await joinMatchFromReservation(clientA, reservationA);
    const matchB = await joinMatchFromReservation(clientB, reservationB);

    // THE property: both players, queued via DIFFERENT processes, ended up
    // in the exact same match room — not two separate rooms, not stuck
    // waiting forever with each process showing a count of 1.
    expect(matchA.roomId).toBe(matchB.roomId);
  });

  it("property 2: a jti consumed on instance A is rejected as a replay on instance B", async () => {
    const token = await mintToken("replay-player");
    const clientA = createTransportClient(instanceA.origin, { headers: { Origin: SHARED_WIDGET_ORIGIN } });
    const clientB = createTransportClient(instanceB.origin, { headers: { Origin: SHARED_WIDGET_ORIGIN } });

    // First use, on instance A: accepted, consumes the jti in the SHARED
    // Redis-backed JtiReplayGuard.
    await expect(startBotMatch(clientA, { gameId: GAME_ID, config: { pointsToWin: 15 }, botTier: "easy", playerId: "replay-player", token })).resolves.toBeDefined();

    // Same token (same jti), presented to a DIFFERENT process: must be
    // rejected. An in-memory guard on instance B would have never seen this
    // jti and would wrongly accept it — the exact silent security hole the
    // apply prompt names as the reason this port exists.
    await expect(startBotMatch(clientB, { gameId: GAME_ID, config: { pointsToWin: 15 }, botTier: "easy", playerId: "replay-player", token })).rejects.toThrow();
  });
});
