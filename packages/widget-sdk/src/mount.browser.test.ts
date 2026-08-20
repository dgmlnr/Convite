import { afterEach, describe, expect, it } from "vitest";
import { applyLayoutMode, applyResizeHeight, mountIframe, unmount } from "./mount.js";

let anchor: HTMLElement | undefined;

afterEach(() => {
  anchor?.remove();
  anchor = undefined;
});

function mountAnchor(): HTMLElement {
  const el = document.createElement("script");
  document.body.appendChild(el);
  anchor = el;
  return el;
}

describe("mountIframe", () => {
  it("mounts a real iframe carrying the exact given src, right after the anchor", () => {
    const el = mountAnchor();

    const handle = mountIframe(document, el, "https://play.hexdev.example/embed?k=pk_live_t_abc");

    expect(handle.iframe.tagName).toBe("IFRAME");
    expect(handle.iframe.src).toBe("https://play.hexdev.example/embed?k=pk_live_t_abc");
    unmount(handle);
  });

  it("sandboxes the iframe with exactly allow-scripts and allow-same-origin — nothing broader", () => {
    const el = mountAnchor();

    const handle = mountIframe(document, el, "https://play.hexdev.example/embed?k=pk_live_t_abc");

    const tokens = handle.iframe.getAttribute("sandbox")?.split(" ").sort();
    expect(tokens).toEqual(["allow-same-origin", "allow-scripts"]);
    unmount(handle);
  });

  it("names the iframe for assistive tech with a Spanish title (WCAG 4.1.2: a nameless iframe is announced as nothing at all)", () => {
    const el = mountAnchor();

    const handle = mountIframe(document, el, "https://play.hexdev.example/embed?k=pk_live_t_abc");

    expect(handle.iframe.title).toBe("Juegos");
    unmount(handle);
  });

  it("injects no other script or style element into the host document", () => {
    const el = mountAnchor();
    const scriptCountBefore = document.querySelectorAll("script").length;
    const styleCountBefore = document.querySelectorAll("style").length;

    const handle = mountIframe(document, el, "https://play.hexdev.example/embed?k=pk_live_t_abc");

    expect(document.querySelectorAll("script").length).toBe(scriptCountBefore);
    expect(document.querySelectorAll("style").length).toBe(styleCountBefore);
    unmount(handle);
  });
});

describe("unmount", () => {
  it("removes the mounted container from the document", () => {
    const el = mountAnchor();
    const handle = mountIframe(document, el, "https://play.hexdev.example/embed?k=pk_live_t_abc");
    expect(document.body.contains(handle.container)).toBe(true);

    unmount(handle);

    expect(document.body.contains(handle.container)).toBe(false);
  });
});

describe("applyResizeHeight", () => {
  it("sets the iframe's own height in pixels to a real reported value", () => {
    const el = mountAnchor();
    const handle = mountIframe(document, el, "https://play.hexdev.example/embed?k=pk_live_t_abc");

    applyResizeHeight(handle, 742);

    expect(handle.iframe.style.height).toBe("742px");
    unmount(handle);
  });

  it("ignores a non-finite or non-positive height instead of corrupting the layout", () => {
    const el = mountAnchor();
    const handle = mountIframe(document, el, "https://play.hexdev.example/embed?k=pk_live_t_abc");
    applyResizeHeight(handle, 300);

    applyResizeHeight(handle, -5);

    expect(handle.iframe.style.height).toBe("300px");
    unmount(handle);
  });
});

describe("applyLayoutMode", () => {
  it("switches the container to a fixed, full-viewport box in fullscreen mode — the inline-that-expands rule", () => {
    const el = mountAnchor();
    const handle = mountIframe(document, el, "https://play.hexdev.example/embed?k=pk_live_t_abc");

    applyLayoutMode(handle, "fullscreen");

    expect(handle.container.style.position).toBe("fixed");
    expect(handle.container.style.inset).toBe("0px");
    unmount(handle);
  });

  it("returns the container to the host's normal document flow in inline mode", () => {
    const el = mountAnchor();
    const handle = mountIframe(document, el, "https://play.hexdev.example/embed?k=pk_live_t_abc");
    applyLayoutMode(handle, "fullscreen");

    applyLayoutMode(handle, "inline");

    expect(handle.container.style.position).toBe("static");
    unmount(handle);
  });
});
