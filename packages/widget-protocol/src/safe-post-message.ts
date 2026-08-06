import { isProtocolMessage, type ProtocolMessage } from "./messages.js";
import type { TargetOrigin } from "./target-origin.js";

/**
 * The minimal structural shape this package needs from `window`/an iframe's
 * `contentWindow`. Deliberately NOT the DOM lib's `Window` type — this
 * package has zero dependencies and no `lib.dom.d.ts` requirement, so any
 * object with a `postMessage` method (a real window, a test double) works.
 */
export interface MessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

/** The minimal structural shape this package needs from a `MessageEvent`. */
export interface MessageEventLike {
  readonly origin: string;
  readonly data: unknown;
}

/**
 * Sends a `ProtocolMessage` to `target`. The `targetOrigin` parameter is
 * typed as `TargetOrigin`, not `string` — the only way to produce one is
 * `parseTargetOrigin`, which throws on `"*"`. There is no overload, no
 * optional parameter, and no way to reach the underlying `postMessage` call
 * from this module that accepts a raw string, so `postProtocolMessage(win,
 * msg, "*")` is a TypeScript compile error at the call site, not a runtime
 * mistake a reviewer has to spot in a diff.
 */
export function postProtocolMessage(target: MessageTarget, message: ProtocolMessage, targetOrigin: TargetOrigin): void {
  target.postMessage(message, targetOrigin);
}

/**
 * Builds a `message`-event handler that only ever calls `onMessage` for a
 * message whose `event.origin` matches `expectedOrigin` EXACTLY and whose
 * `event.data` is a well-formed `ProtocolMessage` (per `isProtocolMessage`).
 * Every other event — wrong origin, foreign namespace, malformed payload —
 * is silently discarded, never causes a DOM mutation, and never reaches
 * `onMessage` at all.
 *
 * `expectedOrigin` is `TargetOrigin`, for the same structural reason as
 * `postProtocolMessage`: accepting from `"*"` (i.e. skipping the origin
 * check) cannot be expressed by a caller of this function, only by a caller
 * that bypasses it and wires `window.addEventListener("message", ...)`
 * directly — which is exactly what this module exists to make unnecessary.
 */
export function createProtocolMessageListener(
  expectedOrigin: TargetOrigin,
  onMessage: (message: ProtocolMessage) => void,
): (event: MessageEventLike) => void {
  return (event) => {
    if (event.origin !== expectedOrigin) return;
    if (!isProtocolMessage(event.data)) return;
    onMessage(event.data);
  };
}
