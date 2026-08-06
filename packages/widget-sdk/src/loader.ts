import {
  createProtocolMessageListener,
  negotiateProtocolVersion,
  postProtocolMessage,
  PROTOCOL_NAMESPACE,
  type TargetOrigin,
} from "@hexdev/widget-protocol";
import { applyLayoutMode, applyResizeHeight, mountIframe, unmount, type MountHandle } from "./mount.js";
import { buildEmbedUrl, readLoaderConfig } from "./widget-config.js";

/** How long the loader waits for the iframe's `ready` handshake before
 * giving up and removing the mount (design §6, spec: "never leave a broken
 * box on a tenant's page"). */
const DEFAULT_READY_TIMEOUT_MS = 8_000;

export interface InitWidgetOptions {
  readonly widgetOrigin: TargetOrigin;
  readonly readyTimeoutMs?: number;
}

export interface WidgetHandle extends MountHandle {
  /** Tears the mount AND the window-level message listener down. Safe to
   * call more than once. */
  dispose(): void;
}

/**
 * The loader's whole job, in one function (design §6's own boundary: "never
 * add a feature to loader.js that could live inside the iframe" — mount,
 * relay resize, relay theme, handle version mismatch, fail silently on
 * timeout, nothing else). Returns `undefined` without mounting anything if
 * the tenant forgot `data-embed-key` — there is nothing safe to build a
 * `src` from.
 */
export function initWidget(
  scriptTag: HTMLScriptElement,
  doc: Document,
  win: Window,
  options: InitWidgetOptions,
): WidgetHandle | undefined {
  const config = readLoaderConfig(scriptTag);
  if (config === null) return undefined;

  const hostOrigin = win.location.origin;

  // The isolation this widget depends on comes from the iframe being a
  // SEPARATE ORIGIN, not from `sandbox`. With `allow-scripts allow-same-origin`
  // on a SAME-origin frame, the framed document can reach its parent and strip
  // the sandbox attribute outright — the boundary silently stops existing.
  //
  // That is a misconfiguration, not an attack: a tenant proxying the widget
  // under their own domain, or a dev pointing at the host's own origin, gets
  // there by accident. So refuse to mount rather than mount something that
  // merely looks isolated. Fail closed.
  if (options.widgetOrigin === hostOrigin) return undefined;
  const src = buildEmbedUrl(options.widgetOrigin, config, hostOrigin);
  const mount = mountIframe(doc, scriptTag, src);
  const readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;

  let disposed = false;

  const teardown = (): void => {
    if (disposed) return;
    disposed = true;
    win.clearTimeout(timeoutId);
    win.removeEventListener("message", listener);
    unmount(mount);
  };

  const timeoutId = win.setTimeout(teardown, readyTimeoutMs);

  const listener = createProtocolMessageListener(options.widgetOrigin, (message) => {
    switch (message.type) {
      case "ready": {
        win.clearTimeout(timeoutId);
        const negotiated = negotiateProtocolVersion(message.payload.protocolVersions);
        if (negotiated === null) {
          teardown();
          return;
        }
        const target = mount.iframe.contentWindow;
        if (target === null) return;
        postProtocolMessage(
          target,
          {
            ns: PROTOCOL_NAMESPACE,
            v: negotiated,
            type: "host-hello",
            payload: { hostOrigin, locale: win.navigator.language, theme: config.themeOverride },
          },
          options.widgetOrigin,
        );
        break;
      }
      case "resize":
        applyResizeHeight(mount, message.payload.height);
        break;
      case "layout":
        applyLayoutMode(mount, message.payload.mode);
        break;
      case "error":
        teardown();
        break;
      default:
        break;
    }
  });

  win.addEventListener("message", listener);

  return { ...mount, dispose: teardown };
}
