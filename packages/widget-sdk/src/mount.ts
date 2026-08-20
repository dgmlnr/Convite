import type { LayoutMessage } from "@hexdev/widget-protocol";

/**
 * `allow-scripts` — our own app needs to run; `allow-same-origin` — our own
 * app needs its own storage (session token, `playerId`). Nothing broader.
 * Design §6's honest disclosure applies here: because the iframe is loaded
 * from a genuinely cross-origin URL, isolation comes from that origin
 * boundary, not from `sandbox` — `sandbox` alone with these two tokens does
 * not add extra isolation on top of an already-cross-origin document, and
 * this loader never claims that it does.
 */
export const SANDBOX_TOKENS = "allow-scripts allow-same-origin";

export interface MountHandle {
  readonly container: HTMLElement;
  readonly iframe: HTMLIFrameElement;
}

/**
 * Mounts the ONE piece of DOM this loader is allowed to touch (spec: "The
 * loader MUST be the only code touching the host DOM... no other
 * script/style is injected"): a `<div>` container wrapping a sandboxed
 * `<iframe>`, inserted immediately after the tenant's own `<script>` tag.
 * The container exists so "inline that expands" (`applyLayoutMode`) has one
 * element to reposition without fighting the iframe's own box model.
 */
export function mountIframe(doc: Document, anchor: Element, src: string): MountHandle {
  const container = doc.createElement("div");
  container.style.display = "block";
  container.style.width = "100%";

  const iframe = doc.createElement("iframe");
  iframe.setAttribute("sandbox", SANDBOX_TOKENS);
  // WCAG 4.1.2: a title-less iframe is announced by screen readers as
  // nothing at all, or as its raw URL. "Juegos" is the honest name at mount
  // time — the loader knows only the embed src here (no tenant name, no
  // catalog yet; those live server-side behind /embed), and every user-facing
  // string in this product is Spanish. The inner document's own <title>
  // (embed-shell.ts) carries the fuller name once it loads.
  iframe.title = "Juegos";
  iframe.src = src;
  iframe.style.display = "block";
  iframe.style.width = "100%";
  iframe.style.height = "0";
  iframe.style.border = "0";

  container.appendChild(iframe);
  anchor.insertAdjacentElement("afterend", container);
  return { container, iframe };
}

/** Removes the mount entirely — used on ready-timeout and on a fatal
 * `error`/version-mismatch signal from the iframe (spec: "never leave a
 * broken box on a tenant's page"). */
export function unmount(handle: MountHandle): void {
  handle.container.remove();
}

/** Resize relay (design §6): the iframe reports its own content height, the
 * loader applies it directly. Non-finite/non-positive values are ignored
 * rather than applied, since a malformed height would otherwise corrupt the
 * host's layout with no way for the host to recover on its own. */
export function applyResizeHeight(handle: MountHandle, height: number): void {
  if (!Number.isFinite(height) || height <= 0) return;
  handle.iframe.style.height = `${height}px`;
}

/**
 * "Inline that expands" (obs 2955): starts contained in the host's layout,
 * expands to fill the viewport once a match begins, respecting the host's
 * page until the player commits. `zIndex` uses the maximum safe 32-bit
 * value so the widget sits above arbitrary host page content without the
 * loader needing to know anything about that page's own stacking context.
 */
export function applyLayoutMode(handle: MountHandle, mode: LayoutMessage["payload"]["mode"]): void {
  if (mode === "fullscreen") {
    handle.container.style.position = "fixed";
    handle.container.style.inset = "0";
    handle.container.style.zIndex = "2147483647";
    handle.iframe.style.height = "100%";
  } else {
    handle.container.style.position = "static";
    handle.container.style.inset = "";
    handle.container.style.zIndex = "";
  }
}
