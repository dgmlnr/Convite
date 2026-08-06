/** The minimal structural shape this needs from a `fetch`-like function — a
 * plain function double works in a node test, no real network required, same
 * convention as `ClientLike`/`RoomLike` in `transport-colyseus-client`. */
export type FetchLike = (input: string, init?: { readonly method?: string }) => Promise<{ readonly ok: boolean; json(): Promise<unknown> }>;

export interface RenewSessionOptions {
  readonly embedKey: string;
  readonly playerId: string;
}

/** Builds the `/session/renew` request URL — a pure function, the same
 * discipline `match-flow.ts`'s `deriveWsEndpoint` already uses to keep
 * anything URL-shaped trivially unit-testable without a real fetch. */
export function buildRenewUrl(embedKey: string, playerId: string): string {
  const params = new URLSearchParams({ k: embedKey, p: playerId });
  return `/session/renew?${params.toString()}`;
}

/**
 * Obtains a FRESH session token right before it is needed (obs 2968), rather
 * than the widget carrying the `/embed` page-load bootstrap token around
 * until the player finally decides to play. `POST`, deliberately: a
 * same-origin GET fetch from inside this iframe carries no `Origin` header
 * in a real browser (the exact same discovery `bootstrap-data.ts`'s own doc
 * comment already made for `/embed`) — `apps/server`'s handler falls back to
 * `Referer`, which IS sent, but `POST` is the more robust, explicit choice
 * for a request that is not idempotent (each call mints a new `jti`).
 */
export async function renewSessionToken(fetchImpl: FetchLike, options: RenewSessionOptions): Promise<string> {
  const response = await fetchImpl(buildRenewUrl(options.embedKey, options.playerId), { method: "POST" });
  if (!response.ok) {
    throw new Error("renewSessionToken: the server refused to renew this session");
  }
  const body = await response.json();
  const token = (body as { readonly token?: unknown }).token;
  if (typeof token !== "string") {
    throw new Error("renewSessionToken: malformed response, no token field");
  }
  return token;
}
