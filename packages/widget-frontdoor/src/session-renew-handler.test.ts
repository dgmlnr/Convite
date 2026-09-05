import { describe, expect, it } from "vitest";
import { createRateLimiter, createSessionTokenIssuer, createStaticTenantRepository, deriveTestSessionSigningKey } from "@hexdev/platform-core";
import type { TenantId } from "@hexdev/platform-core";
import type { GameId, PlayerId } from "@hexdev/platform-contract";
import { handleSessionRenewRequest } from "./session-renew-handler.js";

const TENANT_ID = "tenant-a" as TenantId;
const TENANT_HOST_ORIGIN = "https://tenant-a.example"; // must NEVER be accepted by this handler
const WIDGET_ORIGIN = "https://play.hexdev.example";
const CLIENT_IP = "203.0.113.1";
const TRUCO_ID = "truco-argentino" as GameId;
const PLAYER_ID = "player-a" as PlayerId;
/** Ten years out, matching `scripts/dev-tenant-seed.mjs`'s own convention
 * (tenant-administration slice 5/PR6b) and `tenant-auth.test.ts`'s identical
 * fixture fix (slice 6, task 6.3): every test below is NOT itself about
 * window enforcement (that lands in a later slice-6 PR, task 6.9) and needs
 * a tenant that is unambiguously "currently paid up", or design #1.3's
 * "zero window configured = inactive" rule refuses every one of them the
 * moment `renewSessionForWidget` (tenant-auth.ts) starts enforcing it. */
const FAR_FUTURE_VALID_UNTIL = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;

/** Generous limits by default, same convention as embed-handler.test.ts's
 * own `deps()` — the dedicated rate-limiting describe block below overrides. */
async function deps(overrides: { ipLimit?: number; keyLimit?: number } = {}) {
  const repository = createStaticTenantRepository([
    { id: TENANT_ID, embedKey: "pk_live_t_a", allowedOrigins: [TENANT_HOST_ORIGIN], entitledGames: [TRUCO_ID], validUntil: FAR_FUTURE_VALID_UNTIL },
  ]);
  const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
  return {
    repository,
    issuer,
    ttlSeconds: 120,
    allowedWidgetOrigins: [WIDGET_ORIGIN],
    ipLimiter: createRateLimiter({ limit: overrides.ipLimit ?? 1000, windowMs: 60_000 }),
    keyLimiter: createRateLimiter({ limit: overrides.keyLimit ?? 1000, windowMs: 60_000 }),
  };
}

describe("handleSessionRenewRequest (obs 2968: renew a session right before a join, never carrying the page-load bootstrap token around)", () => {
  it("mints a fresh token when the request's own origin is an allowed WIDGET origin", async () => {
    const url = new URL(`https://play.hexdev.example/session/renew?k=pk_live_t_a&p=${PLAYER_ID}`);
    const result = await handleSessionRenewRequest(url, WIDGET_ORIGIN, CLIENT_IP, await deps());
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as { token: string };
    expect(typeof body.token).toBe("string");
  });

  it("rejects an origin matching the TENANT's own host-page allowlist — that is never this endpoint's check", async () => {
    const url = new URL(`https://play.hexdev.example/session/renew?k=pk_live_t_a&p=${PLAYER_ID}`);
    const result = await handleSessionRenewRequest(url, TENANT_HOST_ORIGIN, CLIENT_IP, await deps());
    expect(result.status).toBe(403);
    expect(result.body).not.toContain("token");
  });

  it("rejects when the Origin/Referer evidence is missing entirely", async () => {
    const url = new URL(`https://play.hexdev.example/session/renew?k=pk_live_t_a&p=${PLAYER_ID}`);
    const result = await handleSessionRenewRequest(url, undefined, CLIENT_IP, await deps());
    expect(result.status).toBe(400);
  });

  it("rejects an unknown embed key", async () => {
    const url = new URL(`https://play.hexdev.example/session/renew?k=pk_does_not_exist&p=${PLAYER_ID}`);
    const result = await handleSessionRenewRequest(url, WIDGET_ORIGIN, CLIENT_IP, await deps());
    expect(result.status).toBe(403);
  });

  it("rejects a request missing the embed key or player id", async () => {
    const url = new URL("https://play.hexdev.example/session/renew?k=pk_live_t_a");
    const result = await handleSessionRenewRequest(url, WIDGET_ORIGIN, CLIENT_IP, await deps());
    expect(result.status).toBe(400);
  });
});

describe("handleSessionRenewRequest — rate limiting (reuses the SAME per-IP/per-key budget /embed already enforces, never a fresh unbounded surface)", () => {
  it("rejects the request that exceeds the per-IP limit", async () => {
    const url = new URL(`https://play.hexdev.example/session/renew?k=pk_live_t_a&p=${PLAYER_ID}`);
    const shared = await deps({ ipLimit: 1 });
    await handleSessionRenewRequest(url, WIDGET_ORIGIN, CLIENT_IP, shared);
    const second = await handleSessionRenewRequest(url, WIDGET_ORIGIN, CLIENT_IP, shared);
    expect(second.status).toBe(429);
  });

  it("rejects the request that exceeds the per-embed-key limit even from a different IP", async () => {
    const url = new URL(`https://play.hexdev.example/session/renew?k=pk_live_t_a&p=${PLAYER_ID}`);
    const shared = await deps({ keyLimit: 1 });
    await handleSessionRenewRequest(url, WIDGET_ORIGIN, "203.0.113.1", shared);
    const second = await handleSessionRenewRequest(url, WIDGET_ORIGIN, "203.0.113.2", shared);
    expect(second.status).toBe(429);
  });
});
