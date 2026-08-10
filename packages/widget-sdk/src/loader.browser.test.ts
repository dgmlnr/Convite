import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTargetOrigin, PROTOCOL_NAMESPACE, type ReadyMessage } from "@hexdev/widget-protocol";
import { initWidget } from "./loader.js";

// The widget MUST be served from a different origin than the host: with
// `allow-scripts allow-same-origin` on a same-origin frame the framed
// document can strip its own sandbox. Every test mounts cross-origin
// because that is the only configuration the loader accepts.
const WIDGET_ORIGIN = "https://widget.hexdev.test";

let scriptTag: HTMLScriptElement | undefined;

afterEach(() => {
  scriptTag?.remove();
  scriptTag = undefined;
});

function mountScriptTag(attributes: Readonly<Record<string, string>> = { "data-embed-key": "pk_live_t_abc" }): HTMLScriptElement {
  const el = document.createElement("script");
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  document.body.appendChild(el);
  scriptTag = el;
  return el;
}

function readyMessage(protocolVersions: readonly number[]): ReadyMessage {
  return { ns: PROTOCOL_NAMESPACE, v: 1, type: "ready", payload: { protocolVersions } };
}

describe("initWidget", () => {
  it("mounts an iframe whose src carries the tenant embed key and the real host origin", () => {
    const el = mountScriptTag();
    const widgetOrigin = parseTargetOrigin(WIDGET_ORIGIN);

    const handle = initWidget(el, document, window, { widgetOrigin });

    expect(handle?.iframe.src).toContain("k=pk_live_t_abc");
    expect(handle?.iframe.src).toContain(`o=${encodeURIComponent(window.location.origin)}`);
    handle?.dispose();
  });

  it("REFUSES to mount when the widget origin equals the host origin, because the sandbox would be escapable", () => {
    const el = mountScriptTag();

    const handle = initWidget(el, document, window, { widgetOrigin: parseTargetOrigin(window.location.origin) });

    // Fail closed: `allow-scripts allow-same-origin` on a same-origin frame
    // lets the framed document reach its parent and remove the sandbox
    // attribute, so the isolation this widget relies on would silently not
    // exist. Mounting something that merely looks isolated is worse than
    // mounting nothing.
    expect(handle).toBeUndefined();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("mounts nothing and returns undefined when data-embed-key is missing", () => {
    const el = mountScriptTag({});

    const handle = initWidget(el, document, window, { widgetOrigin: parseTargetOrigin(WIDGET_ORIGIN) });

    expect(handle).toBeUndefined();
  });

  it("sends host-hello through the sanctioned wrapper after a ready from the widget origin with an overlapping version", () => {
    const el = mountScriptTag();
    const widgetOrigin = parseTargetOrigin(WIDGET_ORIGIN);
    const handle = initWidget(el, document, window, { widgetOrigin });
    const postSpy = vi.spyOn(handle!.iframe.contentWindow!, "postMessage");

    window.dispatchEvent(new MessageEvent("message", { origin: widgetOrigin, data: readyMessage([1]) }));

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({ ns: PROTOCOL_NAMESPACE, type: "host-hello" }),
      widgetOrigin,
    );
    handle!.dispose();
  });

  it("REJECTS a ready message posted from an untrusted origin — never sends host-hello for it", () => {
    const el = mountScriptTag();
    const widgetOrigin = parseTargetOrigin(WIDGET_ORIGIN);
    const handle = initWidget(el, document, window, { widgetOrigin });
    const postSpy = vi.spyOn(handle!.iframe.contentWindow!, "postMessage");

    window.dispatchEvent(new MessageEvent("message", { origin: "https://attacker.example", data: readyMessage([1]) }));

    expect(postSpy).not.toHaveBeenCalled();
    handle!.dispose();
  });

  it("removes the iframe when ready never arrives within the configured timeout", async () => {
    const el = mountScriptTag();
    const widgetOrigin = parseTargetOrigin(WIDGET_ORIGIN);
    const handle = initWidget(el, document, window, { widgetOrigin, readyTimeoutMs: 20 });
    expect(document.body.contains(handle!.container)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(document.body.contains(handle!.container)).toBe(false);
  });

  it("renders no host UI on a version mismatch — just removes the iframe, per the minimal-loader rule", () => {
    const el = mountScriptTag();
    const widgetOrigin = parseTargetOrigin(WIDGET_ORIGIN);
    const handle = initWidget(el, document, window, { widgetOrigin });

    window.dispatchEvent(new MessageEvent("message", { origin: widgetOrigin, data: readyMessage([999]) }));

    expect(document.body.contains(handle!.container)).toBe(false);
  });

  it("applies a resize while inline", () => {
    const el = mountScriptTag();
    const widgetOrigin = parseTargetOrigin(WIDGET_ORIGIN);
    const handle = initWidget(el, document, window, { widgetOrigin });

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: widgetOrigin,
        data: { ns: PROTOCOL_NAMESPACE, v: 1, type: "resize", payload: { height: 480 } },
      }),
    );

    expect(handle!.iframe.style.height).toBe("480px");
    handle!.dispose();
  });

  it("ignores a resize once fullscreen — the fullscreen container already fills the viewport (position:fixed;inset:0); letting a later resize keep overwriting iframe.style.height fights that box and can push content past the viewport with no way for the host page to scroll to it (stable window height, apply prompt)", () => {
    const el = mountScriptTag();
    const widgetOrigin = parseTargetOrigin(WIDGET_ORIGIN);
    const handle = initWidget(el, document, window, { widgetOrigin });

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: widgetOrigin,
        data: { ns: PROTOCOL_NAMESPACE, v: 1, type: "layout", payload: { mode: "fullscreen" } },
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: widgetOrigin,
        data: { ns: PROTOCOL_NAMESPACE, v: 1, type: "resize", payload: { height: 1200 } },
      }),
    );

    expect(handle!.iframe.style.height).toBe("100%");
    handle!.dispose();
  });

  it("resumes applying resize once layout returns to inline", () => {
    const el = mountScriptTag();
    const widgetOrigin = parseTargetOrigin(WIDGET_ORIGIN);
    const handle = initWidget(el, document, window, { widgetOrigin });

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: widgetOrigin,
        data: { ns: PROTOCOL_NAMESPACE, v: 1, type: "layout", payload: { mode: "fullscreen" } },
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: widgetOrigin,
        data: { ns: PROTOCOL_NAMESPACE, v: 1, type: "layout", payload: { mode: "inline" } },
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: widgetOrigin,
        data: { ns: PROTOCOL_NAMESPACE, v: 1, type: "resize", payload: { height: 640 } },
      }),
    );

    expect(handle!.iframe.style.height).toBe("640px");
    handle!.dispose();
  });
});
