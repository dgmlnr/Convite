import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTargetOrigin, PROTOCOL_NAMESPACE, type ReadyMessage } from "@hexdev/widget-protocol";

// Cross-origin is the only configuration the loader accepts: a same-origin
// frame with `allow-scripts allow-same-origin` can strip its own sandbox.
const WIDGET_ORIGIN = "https://widget.hexdev.test";
import { initWidget, type WidgetHandle } from "./loader.js";

/**
 * The hostile-host fixture the apply prompt asked for: a page with an
 * aggressive global CSS reset, its own `postMessage`/`message` listener,
 * and a conflicting global namespace collision — proving the widget mounts
 * and behaves correctly despite all three, on a REAL page in real Chromium
 * (Vitest Browser Mode), not a mock DOM.
 */

let resetStyle: HTMLStyleElement | undefined;
let scriptTag: HTMLScriptElement | undefined;
let handle: WidgetHandle | undefined;
let hostileListenerCalls: MessageEvent[] = [];

function hostileListener(event: MessageEvent): void {
  hostileListenerCalls.push(event);
}

beforeEach(() => {
  // 1. Aggressive global CSS reset — the exact shape the prompt names.
  resetStyle = document.createElement("style");
  resetStyle.textContent = "* { all: unset !important; }";
  document.head.appendChild(resetStyle);

  // 2. The host page runs its own, unrelated postMessage listener.
  hostileListenerCalls = [];
  window.addEventListener("message", hostileListener);

  // 3. A conflicting global namespace: some OTHER script on this page
  // already owns `window.hexdevGamify` before our loader ever runs.
  (window as unknown as Record<string, unknown>).hexdevGamify = "some-unrelated-hostile-value";
});

afterEach(() => {
  handle?.dispose();
  handle = undefined;
  scriptTag?.remove();
  scriptTag = undefined;
  resetStyle?.remove();
  resetStyle = undefined;
  window.removeEventListener("message", hostileListener);
  delete (window as unknown as Record<string, unknown>).hexdevGamify;
});

function readyMessage(protocolVersions: readonly number[]): ReadyMessage {
  return { ns: PROTOCOL_NAMESPACE, v: 1, type: "ready", payload: { protocolVersions } };
}

describe("widget survives a hostile host page", () => {
  it("mounts a correctly sandboxed iframe despite the host's own `* { all: unset }` reset", () => {
    scriptTag = document.createElement("script");
    scriptTag.setAttribute("data-embed-key", "pk_live_t_abc");
    document.body.appendChild(scriptTag);
    const widgetOrigin = parseTargetOrigin(WIDGET_ORIGIN);

    handle = initWidget(scriptTag, document, window, { widgetOrigin });

    expect(handle?.iframe.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    expect(handle?.iframe.src).toContain("k=pk_live_t_abc");
  });

  it("does not touch the host's own conflicting `window.hexdevGamify` global", () => {
    scriptTag = document.createElement("script");
    scriptTag.setAttribute("data-embed-key", "pk_live_t_abc");
    document.body.appendChild(scriptTag);
    const widgetOrigin = parseTargetOrigin(WIDGET_ORIGIN);

    handle = initWidget(scriptTag, document, window, { widgetOrigin });

    expect((window as unknown as Record<string, unknown>).hexdevGamify).toBe("some-unrelated-hostile-value");
  });

  it("keeps content inside the iframe's own document unaffected by the host's CSS reset (real cross-document boundary)", async () => {
    scriptTag = document.createElement("script");
    scriptTag.setAttribute("data-embed-key", "pk_live_t_abc");
    document.body.appendChild(scriptTag);
    const widgetOrigin = parseTargetOrigin(WIDGET_ORIGIN);
    handle = initWidget(scriptTag, document, window, { widgetOrigin });
    const mounted = handle!;

    // The real production loader always points `src` at a genuinely
    // cross-origin URL (proven separately in widget-config.test.ts /
    // loader.browser.test.ts). `srcdoc` is used HERE ONLY so this test can
    // read `contentDocument` from the same page the assertion runs on — it
    // proves the underlying platform guarantee (a document boundary blocks
    // inherited CSS, regardless of what content loads inside it), not a
    // behavior specific to `srcdoc` itself.
    const loaded = new Promise<void>((resolve) => mounted.iframe.addEventListener("load", () => resolve(), { once: true }));
    mounted.iframe.srcdoc = '<p id="marker" style="color: rgb(200, 0, 0); font-family: serif;">stub</p>';
    await loaded;

    const marker = mounted.iframe.contentDocument?.getElementById("marker");
    expect(marker).not.toBeNull();
    const computed = mounted.iframe.contentWindow!.getComputedStyle(marker!);
    expect(computed.color).toBe("rgb(200, 0, 0)");
    expect(computed.fontFamily).toBe("serif");
  });

  it("still rejects a ready message from an untrusted origin even while the host's own hostile listener also receives it", () => {
    scriptTag = document.createElement("script");
    scriptTag.setAttribute("data-embed-key", "pk_live_t_abc");
    document.body.appendChild(scriptTag);
    const widgetOrigin = parseTargetOrigin(WIDGET_ORIGIN);
    handle = initWidget(scriptTag, document, window, { widgetOrigin });
    const mounted = handle!;
    const postSpy = vi.spyOn(mounted.iframe.contentWindow!, "postMessage");

    window.dispatchEvent(new MessageEvent("message", { origin: "https://attacker.example", data: readyMessage([1]) }));

    // The hostile page's own listener still sees the raw event (this loader
    // cannot and does not try to prevent that) — but OUR handler ignored it.
    expect(hostileListenerCalls).toHaveLength(1);
    expect(postSpy).not.toHaveBeenCalled();
  });
});
