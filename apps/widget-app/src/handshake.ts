import {
  createProtocolMessageListener,
  negotiateProtocolVersion,
  postProtocolMessage,
  PROTOCOL_NAMESPACE,
  SUPPORTED_PROTOCOL_VERSIONS,
  type HostHelloMessage,
  type LayoutMessage,
  type MessageTarget,
  type TargetOrigin,
} from "@hexdev/widget-protocol";

export interface HandshakeHandle {
  sendResize(height: number): void;
  sendLayout(mode: LayoutMessage["payload"]["mode"]): void;
  dispose(): void;
}

/**
 * The iframe side of design §6's handshake: send `ready` immediately (this
 * build's own supported versions — `negotiateProtocolVersion` on the
 * LOADER side is what actually picks the version, this side just offers),
 * then relay `resize`/`layout` back once the caller has something to
 * report.
 *
 * `target` (where messages are SENT, `window.parent` in production) and
 * `listenerWindow` (where the `message` event is attached, `window`) are
 * two explicit parameters rather than one `win` this function derives
 * `.parent` from internally: Vitest's Browser Mode runs each test file
 * inside its OWN iframe for isolation, so `window.parent` inside a test is
 * the test RUNNER's window, not the test's own — spying on `window`
 * directly would silently observe zero calls. Explicit injection (the same
 * convention `initWidget`/`mountIframe` already use) sidesteps that
 * entirely rather than working around it.
 */
export function connectToHost(
  target: MessageTarget,
  listenerWindow: Window,
  hostOrigin: TargetOrigin,
  onHostHello: (message: HostHelloMessage) => void,
): HandshakeHandle {
  // Tracks the version actually negotiated once host-hello confirms it —
  // `ready` itself has no negotiated version yet, so it always advertises
  // the full supported set at this build's own default version.
  let version: number = SUPPORTED_PROTOCOL_VERSIONS[0];

  const listener = createProtocolMessageListener(hostOrigin, (message) => {
    if (message.type !== "host-hello") return;
    const negotiated = negotiateProtocolVersion([message.v], SUPPORTED_PROTOCOL_VERSIONS);
    if (negotiated !== null) version = negotiated;
    onHostHello(message);
  });
  listenerWindow.addEventListener("message", listener);

  postProtocolMessage(
    target,
    { ns: PROTOCOL_NAMESPACE, v: version, type: "ready", payload: { protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS] } },
    hostOrigin,
  );

  return {
    sendResize(height) {
      postProtocolMessage(target, { ns: PROTOCOL_NAMESPACE, v: version, type: "resize", payload: { height } }, hostOrigin);
    },
    sendLayout(mode) {
      postProtocolMessage(target, { ns: PROTOCOL_NAMESPACE, v: version, type: "layout", payload: { mode } }, hostOrigin);
      // The same fact, recorded where this document's own CSS can read it.
      //
      // Telling the host to go fullscreen and knowing, inside the iframe,
      // that we ARE fullscreen are the same fact, and they used to be
      // knowable only on the host side. The truco felt needs the inside
      // half: fullscreen is the one mode where the widget must fit a height
      // it did not choose (the host pins the container to the viewport and
      // cannot scroll it), so that is the only mode where it caps its own
      // card size — see the FULLSCREEN FIT block in truco-ui's
      // table-styles.ts, and table-viewport-fit.browser.test.ts.
      //
      // Written HERE, in the one function that changes the mode, rather than
      // at the two call sites in main.ts: a third call site added later
      // cannot forget to keep the attribute in step, because there is
      // nothing to remember.
      listenerWindow.document.documentElement.dataset.hexdevLayout = mode;
    },
    dispose() {
      listenerWindow.removeEventListener("message", listener);
    },
  };
}
