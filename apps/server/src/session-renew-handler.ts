import { renewSessionForWidget } from "@hexdev/platform-core";
import type { RateLimiter, SessionTokenIssuer, TenantRepository } from "@hexdev/platform-core";
import type { PlayerId } from "@hexdev/platform-contract";

export interface SessionRenewDeps {
  readonly repository: TenantRepository;
  readonly issuer: SessionTokenIssuer;
  readonly ttlSeconds: number;
  readonly allowedWidgetOrigins: readonly string[];
  readonly ipLimiter: RateLimiter;
  readonly keyLimiter: RateLimiter;
}

export interface SessionRenewResult {
  readonly status: number;
  readonly body: string;
}

/**
 * The framework-agnostic core of `POST /session/renew` (obs 2968): mints a
 * FRESH, short-TTL token immediately before a join, instead of the widget
 * carrying the page-load `/embed` bootstrap token around until the player
 * finally decides to play — which, in a widget embedded inside someone
 * else's content, can genuinely be minutes later, past that token's TTL.
 *
 * Deliberately NOT `handleEmbedRequest`'s origin check: this request always
 * originates from JS running INSIDE the already-mounted iframe (a
 * same-origin call back to this server), so its own `Origin`/`Referer`
 * evidence is ALWAYS this server's own widget origin, never the tenant's
 * host-page origin (see `renewSessionForWidget`'s own docstring for the full
 * argument — the exact same shape as `MatchRoomAuthOptions.allowedWidgetOrigins`
 * on the WebSocket side). Rate limiting reuses the SAME limiter instances
 * `/embed` already enforces (the caller wires them in), so this is not a
 * fresh, separately-budgeted surface.
 */
export async function handleSessionRenewRequest(
  url: URL,
  origin: string | undefined,
  clientIp: string | undefined,
  deps: SessionRenewDeps,
): Promise<SessionRenewResult> {
  const embedKey = url.searchParams.get("k");
  const playerId = url.searchParams.get("p");
  if (embedKey === null || playerId === null || origin === undefined) {
    return { status: 400, body: JSON.stringify({ error: "missing embed key, player id, or origin" }) };
  }
  if (clientIp !== undefined && !deps.ipLimiter.tryConsume(clientIp)) {
    return { status: 429, body: JSON.stringify({ error: "rate-limited" }) };
  }
  if (!deps.keyLimiter.tryConsume(embedKey)) {
    return { status: 429, body: JSON.stringify({ error: "rate-limited" }) };
  }
  const result = await renewSessionForWidget({ ...deps, embedKey, origin, playerId: playerId as PlayerId });
  if (!result.ok) {
    return { status: 403, body: JSON.stringify({ error: result.reason }) };
  }
  return { status: 200, body: JSON.stringify({ token: result.token }) };
}
