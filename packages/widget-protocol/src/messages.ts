/**
 * The wire vocabulary for the loader <-> iframe channel (design §6). Every
 * message on the wire is namespaced and versioned so a host page running
 * several widgets, or a tenant on a stale cached loader, never mistakes one
 * widget's message for another's.
 *
 * `widget-protocol` has ZERO npm dependencies (architectural rule, apply
 * prompt) — message validation below is hand-written structural type
 * guards, not a schema library. This keeps the one package every other
 * widget package depends on free of any supply-chain surface at all.
 */

/** Every message on the channel carries this namespace. Ignore anything else
 * — a host page routinely runs several widgets on one `window`. */
export const PROTOCOL_NAMESPACE = "convite";

/** Protocol versions this build of the vocabulary understands. The iframe
 * advertises its own supported set in `ready`; the loader picks the highest
 * value present in both sets (see `negotiateProtocolVersion`). This is the
 * entire evolvability strategy for a contract that ends up frozen on
 * third-party production sites (design §6). */
export const SUPPORTED_PROTOCOL_VERSIONS = [1] as const;

export type ProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];

interface Envelope<TType extends string, TPayload> {
  readonly ns: typeof PROTOCOL_NAMESPACE;
  readonly v: number;
  readonly type: TType;
  readonly payload: TPayload;
}

/** iframe -> loader. Advertises the protocol versions the iframe build
 * supports, so the loader can negotiate before sending anything else. */
export type ReadyMessage = Envelope<"ready", { protocolVersions: readonly number[] }>;

/** loader -> iframe. Sent once, right after negotiation succeeds. */
export type HostHelloMessage = Envelope<
  "host-hello",
  { hostOrigin: string; locale?: string; theme?: Readonly<Record<string, string>> }
>;

/** iframe -> loader. Content height changed (ResizeObserver-driven); the
 * loader resizes the iframe element to match (design §6, spec: "Iframe
 * content growth triggers host resize"). */
export type ResizeMessage = Envelope<"resize", { height: number }>;

/** loader -> iframe. IntersectionObserver-driven; lets the iframe pause a
 * bot's "thinking" work while scrolled offscreen. */
export type VisibilityMessage = Envelope<"visibility", { visible: boolean }>;

/** iframe -> loader. `mode: "fullscreen"` is the "inline that expands"
 * product decision (obs 2955): the widget starts as a contained block and
 * expands to full screen once a match begins. */
export type LayoutMessage = Envelope<"layout", { mode: "inline" | "fullscreen" }>;

/** iframe -> loader. A version-mismatch or fatal-boot condition; the loader
 * uses this to decide when to give up and remove the iframe. */
export type ErrorMessage = Envelope<"error", { code: string }>;

export type ProtocolMessage =
  | ReadyMessage
  | HostHelloMessage
  | ResizeMessage
  | VisibilityMessage
  | LayoutMessage
  | ErrorMessage;

type PayloadGuard = (payload: unknown) => boolean;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const PAYLOAD_GUARDS: Record<ProtocolMessage["type"], PayloadGuard> = {
  ready: (payload) =>
    isRecord(payload) &&
    Array.isArray(payload.protocolVersions) &&
    payload.protocolVersions.every((entry) => typeof entry === "number"),
  "host-hello": (payload) => isRecord(payload) && typeof payload.hostOrigin === "string",
  resize: (payload) => isRecord(payload) && typeof payload.height === "number",
  visibility: (payload) => isRecord(payload) && typeof payload.visible === "boolean",
  layout: (payload) => isRecord(payload) && (payload.mode === "inline" || payload.mode === "fullscreen"),
  error: (payload) => isRecord(payload) && typeof payload.code === "string",
};

/**
 * Structural validation of an arbitrary `postMessage` payload against the
 * whole protocol vocabulary. Returns `false` for anything foreign — wrong
 * namespace, unknown type, or a payload shape that does not match its own
 * type's guard — rather than throwing, since the caller (a `message` event
 * listener) receives arbitrary data from the page's ambient event bus and
 * must be able to silently ignore all of it.
 */
export function isProtocolMessage(value: unknown): value is ProtocolMessage {
  if (!isRecord(value)) return false;
  if (value.ns !== PROTOCOL_NAMESPACE) return false;
  if (typeof value.v !== "number") return false;
  if (typeof value.type !== "string") return false;
  const guard = PAYLOAD_GUARDS[value.type as ProtocolMessage["type"]];
  if (guard === undefined) return false;
  return guard(value.payload);
}

/**
 * The whole version-negotiation strategy in one function: pick the highest
 * version present in BOTH sets. `null` means no shared version exists — the
 * caller (the iframe, per design §6) renders an "update your snippet"
 * message rather than guessing at a version neither side actually agreed on.
 */
export function negotiateProtocolVersion(
  offeredVersions: readonly number[],
  supportedVersions: readonly number[] = SUPPORTED_PROTOCOL_VERSIONS,
): number | null {
  const shared = supportedVersions.filter((version) => offeredVersions.includes(version));
  if (shared.length === 0) return null;
  return Math.max(...shared);
}
