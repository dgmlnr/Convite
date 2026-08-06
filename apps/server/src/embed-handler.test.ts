import { describe, expect, it } from "vitest";
import { createGameModuleRegistry, createRateLimiter, createSessionTokenIssuer, createStaticTenantRepository } from "@hexdev/platform-core";
import type { TenantId } from "@hexdev/platform-core";
import type { GameId, GameModule, PlayerId } from "@hexdev/platform-contract";
import { handleEmbedRequest } from "./embed-handler.js";

const TENANT_ID = "tenant-a" as TenantId;
const ALLOWED_ORIGIN = "https://tenant-a.example";
const CLIENT_IP = "203.0.113.1";
const TRUCO_ID = "truco-argentino" as GameId;

function fakeTrucoModule(): GameModule<unknown, { readonly playerId: PlayerId }, unknown, unknown> {
  return {
    id: TRUCO_ID,
    metadata: { seatCount: 2, displayNameKey: "games.truco.name", assetBase: "/games/truco-argentino" },
    configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
    createMatch: () => ({}),
    applyAction: () => ({ ok: true, state: {} }),
    getLegalActions: () => [],
    getViewFor: () => ({}),
    getOutcome: () => null,
    serialize: () => null,
    deserialize: () => ({}),
    createBot: () => ({ chooseAction: () => ({ playerId: "bot" as PlayerId }) }),
  };
}

/** Generous limits by default so unrelated tests never trip rate limiting
 * — the dedicated describe block below overrides with tight limits. */
function deps(overrides: { ipLimit?: number; keyLimit?: number; entitledGames?: readonly GameId[] } = {}) {
  const repository = createStaticTenantRepository([
    { id: TENANT_ID, embedKey: "pk_live_t_a", allowedOrigins: [ALLOWED_ORIGIN], entitledGames: overrides.entitledGames ?? [TRUCO_ID] },
  ]);
  const issuer = createSessionTokenIssuer("test-secret");
  return {
    repository,
    issuer,
    ttlSeconds: 120,
    ipLimiter: createRateLimiter({ limit: overrides.ipLimit ?? 1000, windowMs: 60_000 }),
    keyLimiter: createRateLimiter({ limit: overrides.keyLimit ?? 1000, windowMs: 60_000 }),
    registry: createGameModuleRegistry([fakeTrucoModule()]),
  };
}

describe("handleEmbedRequest (spec: tenant-catalog — origin allowlist enforcement)", () => {
  it("mints a token for an allowed origin and a known embed key", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, deps());
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as { token: string };
    expect(typeof body.token).toBe("string");
  });

  it("rejects a disallowed origin and issues no token", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, "https://evil.example", CLIENT_IP, deps());
    expect(result.status).toBe(403);
    expect(result.body).not.toContain("token");
  });

  it("rejects when the Origin header is missing entirely", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, undefined, CLIENT_IP, deps());
    expect(result.status).toBe(400);
  });

  it("rejects an unknown embed key", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_does_not_exist");
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, deps());
    expect(result.status).toBe(403);
  });
});

describe("handleEmbedRequest — catalog (spec: tenant-catalog — server-enforced per-tenant game catalog)", () => {
  it("includes a catalog entry for each of the tenant's entitled, registered games", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, deps());
    const body = JSON.parse(result.body) as { catalog: readonly { id: string }[] };
    expect(body.catalog).toEqual([
      {
        id: TRUCO_ID,
        displayNameKey: "games.truco.name",
        seatCount: 2,
        configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
      },
    ]);
  });

  it("returns an empty catalog when the tenant has no entitlements", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, deps({ entitledGames: [] }));
    const body = JSON.parse(result.body) as { catalog: readonly unknown[] };
    expect(body.catalog).toEqual([]);
  });
});

describe("handleEmbedRequest — rate limiting (hardening: public surface, obs 2945)", () => {
  it("rejects the request that exceeds the per-IP limit, even with a valid key and origin", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const shared = deps({ ipLimit: 1 });
    await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, shared);
    const second = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, shared);
    expect(second.status).toBe(429);
  });

  it("does not rate-limit a different IP once the first IP is exhausted", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const shared = deps({ ipLimit: 1 });
    await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, shared);
    const other = await handleEmbedRequest(url, ALLOWED_ORIGIN, "203.0.113.9", shared);
    expect(other.status).toBe(200);
  });

  it("rejects the request that exceeds the per-embed-key limit even from many different IPs (a leaked key hammered from a botnet)", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const shared = deps({ keyLimit: 1 });
    await handleEmbedRequest(url, ALLOWED_ORIGIN, "203.0.113.1", shared);
    const second = await handleEmbedRequest(url, ALLOWED_ORIGIN, "203.0.113.2", shared);
    expect(second.status).toBe(429);
  });

  it("skips the per-IP check when no client IP is available, but still enforces the per-key limit", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const shared = deps({ ipLimit: 1 });
    await handleEmbedRequest(url, ALLOWED_ORIGIN, undefined, shared);
    const second = await handleEmbedRequest(url, ALLOWED_ORIGIN, undefined, shared);
    expect(second.status).toBe(200); // no IP to track, so no IP-based rejection
  });
});
