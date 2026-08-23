import { createServer, type Server } from "node:http";
import { connect, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { startFrontProxy } from "./front-proxy.js";
import { getFreePorts } from "./free-ports.js";

/**
 * The proxy's ROUTING is pinned by `front-proxy.test.ts`, which tests
 * `routesToMint` as a pure function. This file pins the part that function
 * cannot reach: that a request actually arrives at the role the routing
 * chose, and that an `Upgrade` is handed over as a raw socket rather than
 * answered.
 *
 * That second half is why this file exists. Colyseus matchmaking is an HTTP
 * call followed by an `Upgrade`, so a proxy that forwards ordinary requests
 * and drops upgrades passes every page load and then hangs the instant a
 * match starts — which reads as a broken game rather than a broken harness,
 * the failure shape this project has already paid for more than once.
 *
 * Real sockets, no mocks: the thing under test is socket plumbing, and a
 * mock of a socket would prove only that the mock was written to agree.
 */

interface Upstream {
  readonly origin: string;
  readonly seen: string[];
  readonly upgraded: string[];
  close(): Promise<void>;
}

/** A stand-in role that records what reached it, answers plain requests, and
 * completes a WebSocket-style handshake so an upgrade can be observed
 * end to end. */
async function startUpstream(port: number, name: string): Promise<Upstream> {
  const seen: string[] = [];
  const upgraded: string[] = [];

  const server: Server = createServer((req, res) => {
    seen.push(req.url ?? "");
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`${name}:${req.url ?? ""}`);
  });

  // Tracked and destroyed on close, exactly as a real role has to: Node
  // detaches a hijacked socket, so a fixture that forgets its own would hang
  // its `close()` and make the proxy look guilty of the fixture's leak.
  const held = new Set<Socket>();
  server.on("upgrade", (req, socket: Socket) => {
    upgraded.push(req.url ?? "");
    held.add(socket);
    socket.on("close", () => held.delete(socket));
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
    socket.write(`hello-from-${name}`);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  return {
    origin: `http://localhost:${String(port)}`,
    seen,
    upgraded,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of held) socket.destroy();
        held.clear();
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/** Sends a raw upgrade request and resolves with everything the peer wrote
 * back, so both the handshake and the first payload can be asserted. */
async function rawUpgrade(port: number, path: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: localhost:${String(port)}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    let received = "";
    socket.setTimeout(5_000, () => {
      socket.destroy();
      reject(new Error(`no upgrade response for ${path} within 5000ms; received so far: ${JSON.stringify(received)}`));
    });
    socket.on("data", (chunk: Buffer) => {
      received += chunk.toString();
      if (received.includes("hello-from-")) {
        socket.destroy();
        resolve(received);
      }
    });
    socket.on("error", reject);
  });
}

const running: (() => Promise<void>)[] = [];
afterEach(async () => {
  // Reverse order, so the proxy stops before the upstreams it is holding
  // connections to — a leaked listener on an ephemeral port surfaces later
  // as an unrelated spec failing to bind.
  //
  // Every stop gets its own try, and the reason is the whole subject of this
  // change: cleanup that a single failure can abort is cleanup that turns one
  // leak into all of them. None of the stops below can reject today, which is
  // exactly why the gap would go unnoticed until the day one could.
  const failures: string[] = [];
  for (const stop of running.reverse()) {
    try {
      await stop();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  running.length = 0;
  // Surfaced, not swallowed — a teardown that fails silently is how a leak
  // becomes someone else's mysterious bind error two files later.
  if (failures.length > 0) throw new Error(`teardown failed: ${failures.join("; ")}`);
});

async function startTopology(): Promise<{ proxyPort: number; mint: Upstream; match: Upstream }> {
  const [proxyPort, mintPort, matchPort] = await getFreePorts(3);
  const mint = await startUpstream(mintPort, "mint");
  const match = await startUpstream(matchPort, "match");
  running.push(mint.close, match.close);
  const proxy = await startFrontProxy({ port: proxyPort, mintOrigin: mint.origin, matchOrigin: match.origin });
  running.push(proxy.stop);
  return { proxyPort, mint, match };
}

describe("startFrontProxy — ordinary requests", () => {
  it("delivers a front-door path to the mint role and everything else to the match role", async () => {
    const { proxyPort, mint, match } = await startTopology();

    const frontDoor = await fetch(`http://localhost:${String(proxyPort)}/embed?key=abc`);
    const matchmake = await fetch(`http://localhost:${String(proxyPort)}/matchmake/joinOrCreate/presence`);

    expect(await frontDoor.text()).toBe("mint:/embed?key=abc");
    expect(await matchmake.text()).toBe("match:/matchmake/joinOrCreate/presence");
    expect(mint.seen).toEqual(["/embed?key=abc"]);
    expect(match.seen).toEqual(["/matchmake/joinOrCreate/presence"]);
  });

  /** The query string is part of the path the upstream needs — `/embed`
   * carries the embed key — so forwarding `pathname` alone would strip the
   * one thing that request is about. */
  it("forwards the full url, query string included, not just the pathname", async () => {
    const { proxyPort, mint } = await startTopology();

    await fetch(`http://localhost:${String(proxyPort)}/assets/fronts/1-espada.webp?v=2`);

    expect(mint.seen).toEqual(["/assets/fronts/1-espada.webp?v=2"]);
  });

  it("passes the upstream's status and body back unchanged", async () => {
    const { proxyPort } = await startTopology();

    const response = await fetch(`http://localhost:${String(proxyPort)}/loader.js`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
  });

  /**
   * The 502 branch. A dead upstream must produce an answer, not a hang: the
   * harness's own readiness probe distinguishes 502 from success precisely
   * so a still-booting role cannot be mistaken for a ready one.
   */
  it("answers 502 when the chosen role is not listening, instead of hanging", async () => {
    const [proxyPort, deadPort, matchPort] = await getFreePorts(3);
    const match = await startUpstream(matchPort, "match");
    running.push(match.close);
    const proxy = await startFrontProxy({ port: proxyPort, mintOrigin: `http://localhost:${String(deadPort)}`, matchOrigin: match.origin });
    running.push(proxy.stop);

    const response = await fetch(`http://localhost:${String(proxyPort)}/embed`);

    expect(response.status).toBe(502);
  });
});

describe("startFrontProxy — the socket upgrade", () => {
  /**
   * THE test this file exists for. Without the `upgrade` handler every spec
   * loads its page fine and then freezes the moment a match starts.
   */
  it("hands a matchmaking upgrade to the match role and pipes its bytes back", async () => {
    const { proxyPort, match, mint } = await startTopology();

    const received = await rawUpgrade(proxyPort, "/matchmake/joinOrCreate/presence");

    expect(received).toContain("101 Switching Protocols");
    expect(received).toContain("hello-from-match");
    expect(match.upgraded).toEqual(["/matchmake/joinOrCreate/presence"]);
    expect(mint.upgraded).toEqual([]);
  });

  /**
   * Teardown after an upgrade, which is the case that actually happens: every
   * spec that plays a match leaves an upgraded socket behind.
   *
   * Node DETACHES a hijacked socket from the server, so `closeAllConnections()`
   * does not reach it and `server.close()` waits for it forever. The proxy
   * destroyed both sockets on `error` but not when one side simply closed, so
   * a client that went away cleanly left the upstream half open — and `stop()`
   * never resolved. Measured before the fix: `stop()` still pending after 3s,
   * and the upstream server's own `close()` hanging behind it.
   *
   * `stop()` is awaited in `system.ts` with no timeout of its own, so a hang
   * here is a hang in every spec's teardown.
   */
  it("stops cleanly after an upgrade, instead of waiting forever on a detached socket", async () => {
    const { proxyPort, match } = await startTopology();
    await rawUpgrade(proxyPort, "/matchmake/joinOrCreate/presence");
    expect(match.upgraded).toHaveLength(1);

    // `running` stops it too; this is the assertion that it RESOLVES at all.
    const stop = running[running.length - 1]!;
    const outcome = await Promise.race([stop().then(() => "stopped"), new Promise<string>((resolve) => setTimeout(() => resolve("still pending"), 3_000))]);

    expect(outcome).toBe("stopped");
  });

  /** Upgrades follow the SAME routing as ordinary requests. If they did not,
   * a front-door upgrade would land on colyseus and hang there. */
  it("routes an upgrade by the same rule as a request", async () => {
    const { proxyPort, mint, match } = await startTopology();

    const received = await rawUpgrade(proxyPort, "/session/renew");

    expect(received).toContain("hello-from-mint");
    expect(mint.upgraded).toEqual(["/session/renew"]);
    expect(match.upgraded).toEqual([]);
  });
});
