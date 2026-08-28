import type { ConfigOption, GameFamilyId, GameId } from "@hexdev/platform-contract";
import type { ThemeOverride } from "@hexdev/widget-protocol";

/** The client-side mirror of `apps/server`'s `CatalogEntry` — the SAME shape
 * crosses the wire as plain JSON, so this is a structural type, not an
 * import of server code into the browser bundle. */
export interface CatalogEntry {
  readonly id: GameId;
  /** The game this entry is a way of playing — see the contract's
   * `GameFamilyId`. The server has sent it since `gameFamily` landed; this
   * mirror simply had not declared it, so the client could not read a field
   * that was already on the wire. Required here for the same reason it is
   * required on the server's own `CatalogEntry`: `buildCatalog` normalizes an
   * undeclared family to the game's own id, so no consumer ever sees
   * `undefined`. */
  readonly gameFamily: GameFamilyId;
  readonly displayNameKey: string;
  readonly seatCount: number;
  readonly configOptions: readonly ConfigOption[];
}

export interface BootstrapResult {
  readonly token: string;
  readonly playerId: string;
  readonly catalog: readonly CatalogEntry[];
  /** The client-side mirror of `apps/server`'s `EmbedBootstrap.theme`
   * (design §10 PRIMARY theming path) — see that interface's own docstring.
   * Absent for a tenant with no theme configured (theming is optional). */
  readonly theme?: ThemeOverride;
}

/** The minimal structural shape this needs from `window` — a plain object
 * double works in a node test, no real DOM required. */
export interface BootstrapSource {
  readonly __HEXDEV_BOOTSTRAP__?: BootstrapResult;
}

/**
 * Reads this iframe's own session — DELIBERATELY not fetched a second time.
 * The browser's own navigation to this exact URL (`/embed?k=&o=`) is what
 * minted it server-side; the server inlines the result directly into the
 * HTML response (`window.__HEXDEV_BOOTSTRAP__ = {...}`, see
 * `apps/server/src/embed-shell.ts`) because a SAME-ORIGIN `fetch()` back
 * from inside this iframe to its own server carries NO `Origin` header in a
 * real browser — discovered via a real two-origin Playwright run, not
 * assumed (see apply-progress). `undefined` means the mint failed
 * server-side (unknown tenant, disallowed origin, rate-limited).
 */
export function readInlineBootstrap(source: BootstrapSource): BootstrapResult | undefined {
  return source.__HEXDEV_BOOTSTRAP__;
}
