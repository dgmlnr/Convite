import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTargetOrigin, PROTOCOL_NAMESPACE, type ReadyMessage } from "@hexdev/widget-protocol";
import { initWidget } from "./loader.js";

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
    const widgetOrigin = parseTargetOrigin(window.location.origin);

    const handle = initWidget(el, document, window, { widgetOrigin });

    expect(handle?.iframe.src).toContain("k=pk_live_t_abc");
    expect(handle?.iframe.src).toContain(`o=${encodeURIComponent(window.location.origin)}`);
    handle?.dispose();
  });

  it("mounts nothing and returns undefined when data-embed-key is missing", () => {
    const el = mountScriptTag({});

    const handle = initWidget(el, document, window, { widgetOrigin: parseTargetOrigin(window.location.origin) });

    expect(handle).toBeUndefined();
  });

  it("sends host-hello through the sanctioned wrapper after a same-origin ready with an overlapping version", () => {
    const el = mountScriptTag();
    const widgetOrigin = parseTargetOrigin(window.location.origin);
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
    const widgetOrigin = parseTargetOrigin(window.location.origin);
    const handle = initWidget(el, document, window, { widgetOrigin });
    const postSpy = vi.spyOn(handle!.iframe.contentWindow!, "postMessage");

    window.dispatchEvent(new MessageEvent("message", { origin: "https://attacker.example", data: readyMessage([1]) }));

    expect(postSpy).not.toHaveBeenCalled();
    handle!.dispose();
  });

  it("removes the iframe when ready never arrives within the configured timeout", async () => {
    const el = mountScriptTag();
    const widgetOrigin = parseTargetOrigin(window.location.origin);
    const handle = initWidget(el, document, window, { widgetOrigin, readyTimeoutMs: 20 });
    expect(document.body.contains(handle!.container)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(document.body.contains(handle!.container)).toBe(false);
  });

  it("renders no host UI on a version mismatch — just removes the iframe, per the minimal-loader rule", () => {
    const el = mountScriptTag();
    const widgetOrigin = parseTargetOrigin(window.location.origin);
    const handle = initWidget(el, document, window, { widgetOrigin });

    window.dispatchEvent(new MessageEvent("message", { origin: widgetOrigin, data: readyMessage([999]) }));

    expect(document.body.contains(handle!.container)).toBe(false);
  });
});
