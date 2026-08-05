import { mintSessionForEmbed } from "@hexdev/platform-core";
import type { SessionTokenIssuer, TenantRepository } from "@hexdev/platform-core";
import type { PlayerId } from "@hexdev/platform-contract";

export interface EmbedRequestDeps {
  readonly repository: TenantRepository;
  readonly issuer: SessionTokenIssuer;
  readonly ttlSeconds: number;
}

export interface EmbedRequestResult {
  readonly status: number;
  readonly body: string;
}

/**
 * The framework-agnostic core of `GET /embed` (design §7): resolve the
 * tenant by embed key, validate the REQUEST's own `Origin` header (never a
 * client-suppliable query param — a value the caller controls is not a
 * security boundary) against that tenant's allowlist, mint a short-TTL
 * token. Node's `http.Server` request listener wraps this; it stays testable
 * with a plain `URL` and an origin string, no real socket needed.
 */
export async function handleEmbedRequest(url: URL, origin: string | undefined, deps: EmbedRequestDeps): Promise<EmbedRequestResult> {
  const embedKey = url.searchParams.get("k");
  if (embedKey === null || origin === undefined) {
    return { status: 400, body: JSON.stringify({ error: "missing embed key or origin" }) };
  }
  // Anonymous, browser-generated (design §7) — legitimately client-supplied:
  // it names no privilege, it is embedded into the SIGNED token the client
  // receives, and `MatchRoom.onAuth` never trusts an unsigned playerId again.
  const playerId = (url.searchParams.get("p") ?? crypto.randomUUID()) as PlayerId;
  const result = await mintSessionForEmbed({ ...deps, embedKey, origin, playerId });
  if (!result.ok) {
    return { status: 403, body: JSON.stringify({ error: result.reason }) };
  }
  return { status: 200, body: JSON.stringify({ token: result.token, playerId }) };
}
