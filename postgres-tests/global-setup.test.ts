import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { containerNameFor, dockerRunArgs, isPostgresGreeting, postgresAnswersOn, sslRequestMessage } from "./global-setup.js";

/**
 * Threat: Subprocess. `postgres-tests/global-setup.ts` shells out to
 * `docker run`/`docker exec` with the container name and port baked into
 * argv — if either ever derived from an env var or CLI argument, that
 * external input would reach a subprocess command line. Both derive only
 * from `process.pid` and `getFreePorts`'s own numeric return (asserted at
 * the call sites in `setup()`), so this suite pins the two PURE functions
 * that build those argv pieces, run here without touching Docker at all.
 */
describe("postgres-tests container provisioning stays program-generated", () => {
  it("derives the container name from a process id, not from any external string", () => {
    expect(containerNameFor(12345)).toBe("hexdev-postgres-test-12345");
    expect(containerNameFor(1)).toBe("hexdev-postgres-test-1");
  });

  it("builds docker run args as an array binding the given port to Postgres's own 5432 — never a shell string", () => {
    const args = dockerRunArgs("hexdev-postgres-test-12345", 55123);

    expect(Array.isArray(args)).toBe(true);
    expect(args).toContain("hexdev-postgres-test-12345");
    expect(args).toContain("55123:5432");
    // Every element is its own argv token — none of them contains a space,
    // which is what a concatenated shell string would produce instead.
    for (const token of args) expect(token).not.toMatch(/\s/);
  });
});

/**
 * THE READINESS PROBE, AND THE ONLY THING THAT MAKES IT ONE.
 *
 * `provisionPostgres` used to ask `docker exec <container> pg_isready`, which
 * answers over the container's UNIX SOCKET, and then handed out a URL the
 * HOST connects to over TCP. Those are two different questions, and the
 * `postgres:17-alpine` entrypoint answers them differently on purpose: while
 * `initdb` runs, a TEMPORARY server is up with `listen_addresses=''` — on the
 * socket, on no TCP address at all. Sampling both every 50ms against a
 * starting container, the inside probe said READY at 960ms and 1046ms while
 * the host was still being reset, and the host only got a real reply at
 * 1239ms. That 279ms is the window the harness kept falling into.
 *
 * Everything below runs against plain `node:net` servers — no Docker — so it
 * pins the DECISION rather than the weather on the machine running it. The
 * four rejected shapes are the four the host actually observed while a real
 * container came up: hung up without a byte, reset, refused, and silent.
 */
describe("readiness is decided by what answers the host, not by what answers inside the container", () => {
  const servers: Server[] = [];
  const accepted: Socket[] = [];

  /** EVERY ACCEPTED SOCKET IS DESTROYED BEFORE `close()` IS AWAITED. A bare
   * `net.Server.close()` stops NEW connections and then waits for the open
   * ones, and half of these fences deliberately leave a socket open on one
   * side — the first version of this hook hung for its full ten seconds on
   * exactly those two. (`closeAllConnections()` would say this in one line,
   * but that one is `http.Server`'s; `net.Server` has no such method.) */
  async function closeServers(): Promise<void> {
    for (const socket of accepted.splice(0)) socket.destroy();
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => { resolve(); }))));
  }

  afterEach(closeServers);

  async function listen(onConnection: (socket: Socket) => void): Promise<number> {
    const server = createServer((socket) => {
      accepted.push(socket);
      onConnection(socket);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => { resolve(); }));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("fence setup: the probe server took no TCP port");
    return address.port;
  }

  it("sends the 8-byte SSLRequest, the one message a server answers before any credentials exist", () => {
    // Int32 length 8, then the fixed request code 80877103 (1234 << 16 | 5679).
    // Written out byte by byte rather than recomputed, so a change to the
    // builder cannot agree with itself.
    expect([...sslRequestMessage()]).toEqual([0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f]);
  });

  it("reads `S` and `N` as a server and everything else as not one", () => {
    expect(isPostgresGreeting(Buffer.from("S"))).toBe(true);
    expect(isPostgresGreeting(Buffer.from("N"))).toBe(true);
    expect(isPostgresGreeting(Buffer.alloc(0))).toBe(false);
    expect(isPostgresGreeting(Buffer.from("E"))).toBe(false);
  });

  it("calls a server that answers `N` ready — what postgres:17-alpine, built without TLS, actually replies", async () => {
    const port = await listen((socket) => {
      socket.on("data", () => socket.write(Buffer.from("N")));
    });

    await expect(postgresAnswersOn("127.0.0.1", port, 1_000)).resolves.toBe(true);
  });

  /**
   * THE NEGATIVE CONTROL, and it is the whole reason this probe reads a reply
   * instead of just connecting. This server is Docker's userland proxy to the
   * life: it binds the mapped host port the instant the container starts and
   * accepts every connection, then finds nothing listening inside and hangs
   * up with zero bytes. A probe that stopped at `connect` would call this
   * ready and reintroduce the identical race one layer down.
   */
  it("does NOT call a port that accepts and hangs up without a byte ready", async () => {
    const port = await listen((socket) => {
      socket.end();
    });

    await expect(postgresAnswersOn("127.0.0.1", port, 1_000)).resolves.toBe(false);
  });

  it("does NOT call a port that accepts and then resets ready", async () => {
    const port = await listen((socket) => {
      socket.resetAndDestroy();
    });

    await expect(postgresAnswersOn("127.0.0.1", port, 1_000)).resolves.toBe(false);
  });

  it("does NOT call a port with nothing behind it ready", async () => {
    // A port that was listening and is not any more — the same refusal the
    // host gets in the first quarter-second of a container's life.
    const port = await listen(() => {});
    await closeServers();

    await expect(postgresAnswersOn("127.0.0.1", port, 1_000)).resolves.toBe(false);
  });

  it("does NOT call a port that accepts and then says nothing at all ready", async () => {
    // The slowest shape: connected, never answered. Only the timeout can end
    // this one, so a probe without one would hang the whole harness here.
    const port = await listen(() => {});

    await expect(postgresAnswersOn("127.0.0.1", port, 250)).resolves.toBe(false);
  });
});
