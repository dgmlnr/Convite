import { mintSessionForEmbed } from "@hexdev/platform-core";
import type { RateLimiter, SessionTokenIssuer, TenantRepository } from "@hexdev/platform-core";
import type { PlayerId } from "@hexdev/platform-contract";

export interface EmbedRequestDeps {
  readonly repository: TenantRepository;
  readonly issuer: SessionTokenIssuer;
  readonly ttlSeconds: number;
  readonly ipLimiter: RateLimiter;
  readonly keyLimiter: RateLimiter;
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
 *
 * Rate limiting (hardening, obs 2945: this is now a REAL, unauthenticated,
 * public HTTP endpoint) checks the requester's IP first — cheap, and works
 * even against an unknown/enumerated key — then the embed key itself, which
 * catches one leaked key hammered from many distinct IPs that a per-IP check
 * alone cannot. HONESTY: per-IP is defeated by a distributed source; this
 * stops trivial/accidental abuse, not a determined attacker.
 */
export async function handleEmbedRequest(url: URL, origin: string | undefined, clientIp: string | undefined, deps: EmbedRequestDeps): Promise<EmbedRequestResult> {
  const embedKey = url.searchParams.get("k");
  if (embedKey === null || origin === undefined) {
    return { status: 400, body: JSON.stringify({ error: "missing embed key or origin" }) };
  }
  if (clientIp !== undefined && !deps.ipLimiter.tryConsume(clientIp)) {
    return { status: 429, body: JSON.stringify({ error: "rate-limited" }) };
  }
  if (!deps.keyLimiter.tryConsume(embedKey)) {
    return { status: 429, body: JSON.stringify({ error: "rate-limited" }) };
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
