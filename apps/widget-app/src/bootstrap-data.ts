import type { ConfigOption, GameId } from "@hexdev/platform-contract";
import type { LobbyDisplayEntry } from "@hexdev/platform-core";

/** The client-side mirror of `apps/server`'s `CatalogEntry` — the SAME shape
 * crosses the wire as plain JSON, so this is a structural type, not an
 * import of server code into the browser bundle. */
export interface CatalogEntry {
  readonly id: GameId;
  readonly displayNameKey: string;
  readonly seatCount: number;
  readonly configOptions: readonly ConfigOption[];
}

export interface BootstrapResult {
  readonly token: string;
  readonly playerId: string;
  readonly catalog: readonly CatalogEntry[];
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

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

/**
 * Polls the lobby snapshot for one game (spec: "Lobby Presence Counters Per
 * Point-Target Room"). Degrades to an empty list on any failure rather than
 * throwing: a transient network hiccup on an idle selection screen should
 * never crash the widget, it should just show the next successful poll.
 */
export async function fetchPresence(fetchImpl: FetchLike, gameId: GameId): Promise<readonly LobbyDisplayEntry[]> {
  const response = await fetchImpl(`/presence?gameId=${gameId}`);
  if (!response.ok) return [];
  return (await response.json()) as readonly LobbyDisplayEntry[];
}
