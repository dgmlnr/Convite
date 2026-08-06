/** The minimal structural shape this needs from `window.location` — a plain
 * object literal works in a node test, no real DOM required. */
export interface LocationLike {
  readonly protocol: string;
  readonly host: string;
}

/**
 * The Colyseus WebSocket endpoint is deliberately the SAME origin as this
 * iframe's own page: `apps/server`'s composition root shares ONE
 * `node:http.Server` between the plain HTTP routes (`/embed`, `/loader.js`)
 * and `createMatchServer`'s `WebSocketTransport` (see `server.ts`'s own
 * docstring). No separate `WIDGET_WS_ORIGIN` config exists or is needed —
 * deriving it from `window.location` keeps this correct across every real
 * deployment origin without a build-time constant to keep in sync.
 */
export function deriveWsEndpoint(location: LocationLike): string {
  const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${location.host}`;
}
