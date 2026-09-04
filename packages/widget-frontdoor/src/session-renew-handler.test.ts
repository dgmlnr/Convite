import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { createRateLimiter, createSessionTokenIssuer, createStaticTenantRepository, deriveTestSessionSigningKey } from "@hexdev/platform-core";
import type { TenantId, TenantRepository } from "@hexdev/platform-core";
import type { GameId, PlayerId } from "@hexdev/platform-contract";
import { handleSessionRenewRequest } from "./session-renew-handler.js";

const TENANT_ID = "tenant-a" as TenantId;
const TENANT_HOST_ORIGIN = "https://tenant-a.example"; // must NEVER be accepted by this handler
const WIDGET_ORIGIN = "https://play.hexdev.example";
const CLIENT_IP = "203.0.113.1";
const TRUCO_ID = "truco-argentino" as GameId;
const PLAYER_ID = "player-a" as PlayerId;
/** Ten years out, matching `scripts/dev-tenant-seed.mjs`'s own convention
 * (tenant-administration slice 5/PR6b) and every sibling fixture fix this
 * same slice already applied in `tenant-auth.test.ts`/`embed-handler.test.ts`:
 * every test below that is not itself about window enforcement needs a
 * tenant that is unambiguously "currently paid up". */
const FAR_FUTURE_VALID_UNTIL = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;

/** Generous limits by default, same convention as embed-handler.test.ts's
 * own `deps()` — the dedicated rate-limiting describe block below overrides. */
async function deps(overrides: { ipLimit?: number; keyLimit?: number; validUntil?: number; repository?: TenantRepository } = {}) {
  const repository =
    overrides.repository ??
    createStaticTenantRepository([
      { id: TENANT_ID, embedKey: "pk_live_t_a", allowedOrigins: [TENANT_HOST_ORIGIN], entitledGames: [TRUCO_ID], validUntil: overrides.validUntil ?? FAR_FUTURE_VALID_UNTIL },
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

describe("handleSessionRenewRequest — validity window enforcement (tenant-administration slice 6, task 6.3's HTTP-facing half; window logic itself is tenant-auth.test.ts's own coverage)", () => {
  it("refuses renewal for a tenant whose window has lapsed, with the same 403 every other !ok reason gets", async () => {
    const url = new URL(`https://play.hexdev.example/session/renew?k=pk_live_t_a&p=${PLAYER_ID}`);
    const result = await handleSessionRenewRequest(url, WIDGET_ORIGIN, CLIENT_IP, await deps({ validUntil: Date.now() - 1000 }));
    expect(result.status).toBe(403);
    const body = JSON.parse(result.body) as { error: string };
    expect(body.error).toBe("tenant-not-active");
  });
});

describe("handleSessionRenewRequest — tenant-lookup-failed (task 6.9, design §2.5/§15): the SAME 'mint / renew' 503 mapping design §15's failure-behavior table specifies for both choke points", () => {
  function failingRepository(): TenantRepository {
    return {
      findByEmbedKey: () => Promise.reject(new Error("ECONNREFUSED: simulated Postgres outage")),
      findById: () => Promise.reject(new Error("ECONNREFUSED: simulated Postgres outage")),
    };
  }

  it("maps tenant-lookup-failed to 503, distinct from every other reason's 403", async () => {
    const url = new URL(`https://play.hexdev.example/session/renew?k=pk_live_t_a&p=${PLAYER_ID}`);
    const result = await handleSessionRenewRequest(url, WIDGET_ORIGIN, CLIENT_IP, await deps({ repository: failingRepository() }));
    expect(result.status).toBe(503);
    const body = JSON.parse(result.body) as { error: string };
    expect(body.error).toBe("tenant-lookup-failed");
  });
});

describe("handleSessionRenewRequest — structured refusal log (task 6.9, same shared shape embed-handler.ts uses; design §10/spec Domain D: never a persisted row)", () => {
  let warnings: string[] = [];
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warnings = [];
    warn = vi.spyOn(console, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("logs one structured line naming the reason and the embed key for a refused renewal", async () => {
    const url = new URL(`https://play.hexdev.example/session/renew?k=pk_live_t_a&p=${PLAYER_ID}`);
    await handleSessionRenewRequest(url, WIDGET_ORIGIN, CLIENT_IP, await deps({ validUntil: Date.now() - 1000 }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("tenant-not-active");
    expect(warnings[0]).toContain("pk_live_t_a");
  });

  it("logs nothing at all for a successful renewal", async () => {
    const url = new URL(`https://play.hexdev.example/session/renew?k=pk_live_t_a&p=${PLAYER_ID}`);
    const result = await handleSessionRenewRequest(url, WIDGET_ORIGIN, CLIENT_IP, await deps());
    expect(result.status).toBe(200);
    expect(warnings).toEqual([]);
  });
});
