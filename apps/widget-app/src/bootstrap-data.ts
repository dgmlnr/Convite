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

/**
 * Mints this iframe's own session by calling `/embed` a SECOND time — the
 * first was the browser's own navigation to this exact URL (with the same
 * `k`/`o` query string, still present in `location.search`), which got the
 * static HTML shell instead. An explicit `Accept: application/json` header
 * is what routes this call to the JSON branch of the SAME server-side path
 * (`apps/server/src/index.ts`'s content-negotiation).
 */
export async function fetchBootstrap(fetchImpl: FetchLike, search: string): Promise<BootstrapResult | undefined> {
  const response = await fetchImpl(`/embed${search}`, { headers: { Accept: "application/json" } });
  if (!response.ok) return undefined;
  return (await response.json()) as BootstrapResult;
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
