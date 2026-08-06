import { Client } from "@colyseus/sdk";
import type { ClientLike } from "./ports.js";

export interface TransportClientOptions {
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * The ONLY place this package (and, by the boundary rule this unit fixes,
 * the whole workspace outside `transport-colyseus`) reaches
 * `@colyseus/sdk`'s own `Client` constructor — every other file in this
 * package, and every consumer (`apps/widget-app`), programs against
 * `ClientLike` instead. A real `Client` instance satisfies `ClientLike`
 * structurally with no adapter glue, which is the whole point of `ports.ts`'s
 * narrow interface: this function is the one, tiny, honest seam where that
 * structural compatibility is exercised for real, not asserted.
 */
export function createTransportClient(endpoint: string, options: TransportClientOptions = {}): ClientLike {
  return new Client(endpoint, { headers: options.headers });
}
