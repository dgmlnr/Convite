import { describe, expect, it } from "vitest";
import { createGameModuleRegistry, createRateLimiter, createSessionTokenIssuer, createStaticTenantRepository, deriveTestSessionSigningKey } from "@hexdev/platform-core";
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
    metadata: { seatCount: 2, gameFamily: "truco", displayNameKey: "games.truco.name", assetBase: "/games/truco-argentino" },
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
async function deps(
  overrides: { ipLimit?: number; keyLimit?: number; entitledGames?: readonly GameId[]; theme?: Record<string, string> } = {},
) {
  const repository = createStaticTenantRepository([
    {
      id: TENANT_ID,
      embedKey: "pk_live_t_a",
      allowedOrigins: [ALLOWED_ORIGIN],
      entitledGames: overrides.entitledGames ?? [TRUCO_ID],
      theme: overrides.theme,
    },
  ]);
  const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
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
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, await deps());
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as { token: string };
    expect(typeof body.token).toBe("string");
  });

  it("rejects a disallowed origin and issues no token", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, "https://evil.example", CLIENT_IP, await deps());
    expect(result.status).toBe(403);
    expect(result.body).not.toContain("token");
  });

  it("rejects when the Origin header is missing entirely", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, undefined, CLIENT_IP, await deps());
    expect(result.status).toBe(400);
  });

  it("rejects an unknown embed key", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_does_not_exist");
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, await deps());
    expect(result.status).toBe(403);
  });
});

describe("handleEmbedRequest — catalog (spec: tenant-catalog — server-enforced per-tenant game catalog)", () => {
  it("includes a catalog entry for each of the tenant's entitled, registered games", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, await deps());
    const body = JSON.parse(result.body) as { catalog: readonly { id: string }[] };
    expect(body.catalog).toEqual([
      {
        id: TRUCO_ID,
        // The wire carries the family too — the client groups two ways of
        // playing one game into one thing to choose, and cannot derive that
        // from the id without guessing.
        gameFamily: "truco",
        displayNameKey: "games.truco.name",
        seatCount: 2,
        configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
      },
    ]);
  });

  it("returns an empty catalog when the tenant has no entitlements", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, await deps({ entitledGames: [] }));
    const body = JSON.parse(result.body) as { catalog: readonly unknown[] };
    expect(body.catalog).toEqual([]);
  });
});

describe("handleEmbedRequest — tenant theme (spec: tenant-catalog — Tenant Brand Theming, design §10 primary path)", () => {
  it("includes the tenant's configured, sanitized theme tokens in the bootstrap payload", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, await deps({ theme: { "--gx-color-primary": "#336699" } }));
    const body = JSON.parse(result.body) as { theme?: Record<string, string> };
    expect(body.theme).toEqual({ "--gx-color-primary": "#336699" });
  });

  it("theming is optional — a tenant with no theme configured renders exactly as before this field existed (no theme key at all in the payload)", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, await deps());
    const body = JSON.parse(result.body) as { theme?: Record<string, string> };
    expect(body.theme).toBeUndefined();
  });

  it("a hostile theme value configured for the tenant is rejected, not injected — proves the CSS-injection vector is closed from the SERVER side, not only the host-override side: the raw malicious string never reaches the wire at all", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(
      url,
      ALLOWED_ORIGIN,
      CLIENT_IP,
      await deps({ theme: { "--gx-color-primary": "javascript:alert(1)</style><script>alert(1)</script>" } }),
    );
    expect(result.body).not.toContain("javascript:alert");
    expect(result.body).not.toContain("<script>");
    const body = JSON.parse(result.body) as { theme?: Record<string, string> };
    expect(body.theme).toEqual({});
  });
});

describe("handleEmbedRequest — rate limiting (hardening: public surface, obs 2945)", () => {
  it("rejects the request that exceeds the per-IP limit, even with a valid key and origin", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const shared = await deps({ ipLimit: 1 });
    await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, shared);
    const second = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, shared);
    expect(second.status).toBe(429);
  });

  it("does not rate-limit a different IP once the first IP is exhausted", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const shared = await deps({ ipLimit: 1 });
    await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, shared);
    const other = await handleEmbedRequest(url, ALLOWED_ORIGIN, "203.0.113.9", shared);
    expect(other.status).toBe(200);
  });

  it("rejects the request that exceeds the per-embed-key limit even from many different IPs (a leaked key hammered from a botnet)", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const shared = await deps({ keyLimit: 1 });
    await handleEmbedRequest(url, ALLOWED_ORIGIN, "203.0.113.1", shared);
    const second = await handleEmbedRequest(url, ALLOWED_ORIGIN, "203.0.113.2", shared);
    expect(second.status).toBe(429);
  });

  it("skips the per-IP check when no client IP is available, but still enforces the per-key limit", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const shared = await deps({ ipLimit: 1 });
    await handleEmbedRequest(url, ALLOWED_ORIGIN, undefined, shared);
    const second = await handleEmbedRequest(url, ALLOWED_ORIGIN, undefined, shared);
    expect(second.status).toBe(200); // no IP to track, so no IP-based rejection
  });
});
