import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTargetOrigin, PROTOCOL_NAMESPACE, type HostHelloMessage } from "@hexdev/widget-protocol";
import { connectToHost } from "./handshake.js";

// window.parent === window for a top-level (non-framed) test page — the
// same object connectToHost sends TO, so spying on window.postMessage
// observes it, matching widget-sdk's own loader.browser.test.ts pattern of
// spying on the real target window's postMessage.
const HOST_ORIGIN = parseTargetOrigin("https://tenant.example");

function hostHello(v: number, theme?: Readonly<Record<string, string>>): HostHelloMessage {
  return { ns: PROTOCOL_NAMESPACE, v, type: "host-hello", payload: { hostOrigin: HOST_ORIGIN, theme } };
}

let handle: ReturnType<typeof connectToHost> | undefined;

afterEach(() => {
  handle?.dispose();
  handle = undefined;
});

describe("connectToHost (widget-embed: the iframe side of the postMessage handshake)", () => {
  it("sends ready immediately, advertising every protocol version this build supports", () => {
    const postSpy = vi.spyOn(window, "postMessage");

    handle = connectToHost(window, window, HOST_ORIGIN, () => {});

    expect(postSpy).toHaveBeenCalledWith(expect.objectContaining({ ns: PROTOCOL_NAMESPACE, type: "ready" }), HOST_ORIGIN);
  });

  it("invokes onHostHello when a matching message arrives from the expected host origin", () => {
    const onHostHello = vi.fn();
    handle = connectToHost(window, window, HOST_ORIGIN, onHostHello);
    const message = hostHello(1);

    window.dispatchEvent(new MessageEvent("message", { origin: HOST_ORIGIN, data: message }));

    expect(onHostHello).toHaveBeenCalledWith(message);
  });

  it("ignores a host-hello posted from an untrusted origin", () => {
    const onHostHello = vi.fn();
    handle = connectToHost(window, window, HOST_ORIGIN, onHostHello);

    window.dispatchEvent(new MessageEvent("message", { origin: "https://attacker.example", data: hostHello(1) }));

    expect(onHostHello).not.toHaveBeenCalled();
  });

  it("sendResize posts a resize message carrying the given height", () => {
    handle = connectToHost(window, window, HOST_ORIGIN, () => {});
    const postSpy = vi.spyOn(window, "postMessage");

    handle.sendResize(480);

    expect(postSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "resize", payload: { height: 480 } }), HOST_ORIGIN);
  });

  it("sendLayout posts a layout message carrying the given mode", () => {
    handle = connectToHost(window, window, HOST_ORIGIN, () => {});
    const postSpy = vi.spyOn(window, "postMessage");

    handle.sendLayout("fullscreen");

    expect(postSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "layout", payload: { mode: "fullscreen" } }), HOST_ORIGIN);
  });

  it("sendLayout also records the mode on this document's own root, so the widget's CSS can read what it just told the host", () => {
    // The felt caps its own card size in fullscreen and only in fullscreen
    // (truco-ui's FULLSCREEN FIT block). That cap keys off this attribute,
    // so the attribute IS the contract between the two — asserted here, at
    // the one function that changes the mode, rather than trusted.
    handle = connectToHost(window, window, HOST_ORIGIN, () => {});

    handle.sendLayout("fullscreen");
    expect(document.documentElement.getAttribute("data-hexdev-layout")).toBe("fullscreen");

    // And it comes back down: "inline that expands" collapses again once
    // the match is over, and a widget left marked fullscreen would keep
    // capping its cards against a viewport it no longer fills.
    handle.sendLayout("inline");
    expect(document.documentElement.getAttribute("data-hexdev-layout")).toBe("inline");
  });

  it("dispose stops delivering further host-hello messages", () => {
    const onHostHello = vi.fn();
    handle = connectToHost(window, window, HOST_ORIGIN, onHostHello);
    handle.dispose();

    window.dispatchEvent(new MessageEvent("message", { origin: HOST_ORIGIN, data: hostHello(1) }));

    expect(onHostHello).not.toHaveBeenCalled();
  });
});
