import { createServer, request, type IncomingMessage, type Server } from "node:http";
import { connect, type Socket } from "node:net";

/**
 * The deployment topology, made real for the e2e suite.
 *
 * The mint/verify split (handoff §P4.3) puts the Ed25519 seed in ONE role
 * and leaves the match-serving replicas with a public key alone. That split
 * is only safe if the two roles can sit behind a SINGLE public origin,
 * because the widget builds its `/session/renew` url RELATIVE and the
 * renewal's origin is checked against this deployment's own widget origins
 * (`tenant-auth.ts`'s `renewSessionForWidget`). Give the mint role its own
 * hostname and that check can never pass.
 *
 * So the topology is path routing behind one origin, and this is that
 * routing — not a test convenience. The e2e suite drives the widget through
 * exactly the shape a real deployment has to run, which is the only way the
 * split is proven rather than asserted.
 *
 * WHY IT SPEAKS WEBSOCKET. Colyseus's matchmaking is an HTTP handshake
 * followed by an `Upgrade`, and a proxy that only forwards ordinary requests
 * would pass every spec's page load and then hang the moment a match
 * started — the worst possible failure shape, because it looks like the game
 * is broken rather than the harness. The `upgrade` handler below pipes the
 * raw socket in both directions for exactly that reason.
 */
export interface FrontProxyOptions {
  /** The origin the widget was built against, and the only one a browser sees. */
  readonly port: number;
  /** Where the minting role listens: the front door and the seed. */
  readonly mintOrigin: string;
  /** Where the match role listens: colyseus, and a public key at most. */
  readonly matchOrigin: string;
}

/**
 * Everything a browser touches BEFORE a room exists belongs to the mint
 * role. Everything else — colyseus's `/matchmake/*` and the socket upgrade
 * that follows it — belongs to the match role.
 *
 * Exported and pure so its own test can pin it: routing a path to the wrong
 * role does not error, it 404s or hangs, and both read as a broken product.
 */
export function routesToMint(pathname: string): boolean {
  return pathname === "/embed" || pathname === "/session/renew" || pathname === "/loader.js" || pathname.startsWith("/assets/");
}

function targetFor(origin: string): { host: string; port: number } {
  const url = new URL(origin);
  return { host: url.hostname, port: Number(url.port) };
}

export async function startFrontProxy(options: FrontProxyOptions): Promise<{ readonly server: Server; stop(): Promise<void> }> {
  const mint = targetFor(options.mintOrigin);
  const match = targetFor(options.matchOrigin);

  const server = createServer((clientReq, clientRes) => {
    const pathname = new URL(clientReq.url ?? "/", "http://localhost").pathname;
    const target = routesToMint(pathname) ? mint : match;
    const upstream = request(
      { host: target.host, port: target.port, method: clientReq.method, path: clientReq.url, headers: clientReq.headers },
      (upstreamRes: IncomingMessage) => {
        clientRes.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(clientRes);
      },
    );
    upstream.on("error", () => {
      if (!clientRes.headersSent) clientRes.writeHead(502);
      clientRes.end();
    });
    clientReq.pipe(upstream);
  });

  // Colyseus upgrades to a WebSocket after its HTTP matchmake call, so the
  // proxy has to hand the raw socket over rather than answer the request.
  server.on("upgrade", (req, clientSocket: Socket, head: Buffer) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    const target = routesToMint(pathname) ? mint : match;
    const upstreamSocket = connect(target.port, target.host, () => {
      const headerLines = Object.entries(req.headers).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`);
      upstreamSocket.write(`${req.method ?? "GET"} ${req.url ?? "/"} HTTP/1.1\r\n${headerLines.join("\r\n")}\r\n\r\n`);
      if (head.length > 0) upstreamSocket.write(head);
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
    });
    const destroyBoth = (): void => {
      upstreamSocket.destroy();
      clientSocket.destroy();
    };
    upstreamSocket.on("error", destroyBoth);
    clientSocket.on("error", destroyBoth);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => resolve());
  });

  return {
    server,
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
