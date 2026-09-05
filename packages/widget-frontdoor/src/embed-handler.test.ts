import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { createGameModuleRegistry, createRateLimiter, createSessionTokenIssuer, createStaticTenantRepository, deriveTestSessionSigningKey } from "@hexdev/platform-core";
import type { TenantId, TenantRepository } from "@hexdev/platform-core";
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

/** Ten years out, matching `scripts/dev-tenant-seed.mjs`'s own convention
 * (tenant-administration slice 5/PR6b) and `tenant-auth.test.ts`'s identical
 * fixture fix (slice 6): every test below that is not itself about window
 * enforcement needs a tenant that is unambiguously "currently paid up", or
 * design #1.3's "zero window configured = inactive" rule (correctly)
 * refuses every one of them. */
const FAR_FUTURE_VALID_UNTIL = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;

/** Generous limits by default so unrelated tests never trip rate limiting
 * — the dedicated describe block below overrides with tight limits. */
async function deps(
  overrides: {
    ipLimit?: number;
    keyLimit?: number;
    entitledGames?: readonly GameId[];
    theme?: Record<string, string>;
    validUntil?: number;
    repository?: TenantRepository;
  } = {},
) {
  const repository =
    overrides.repository ??
    createStaticTenantRepository([
      {
        id: TENANT_ID,
        embedKey: "pk_live_t_a",
        allowedOrigins: [ALLOWED_ORIGIN],
        entitledGames: overrides.entitledGames ?? [TRUCO_ID],
        theme: overrides.theme,
        validUntil: overrides.validUntil ?? FAR_FUTURE_VALID_UNTIL,
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
        // And the shelf, one tier above it. This fixture declares no
        // `section`, so what crosses the wire is the NORMALIZED FAMILY —
        // never `undefined`, and never the id.
        section: "truco",
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

describe("handleEmbedRequest — validity window enforcement (tenant-administration slice 6, task 6.1's HTTP-facing half; window logic itself is tenant-auth.test.ts's own coverage)", () => {
  it("refuses an expired tenant with the SAME 403 every other !ok reason gets — the reason travels in the JSON body, never differentiated at the HTML shell (task 6.10's own manual byte-identical proof lives in apply-progress, since `renderEmbedShell` is a different package's own function)", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, await deps({ validUntil: Date.now() - 1000 }));
    expect(result.status).toBe(403);
    expect(result.body).not.toContain("token");
    const body = JSON.parse(result.body) as { error: string };
    expect(body.error).toBe("tenant-not-active");
  });
});

describe("handleEmbedRequest — tenant-lookup-failed (task 6.7/6.8, design §2.5/§15): a request-time repository failure gets ITS OWN status, distinguishable from every other refusal", () => {
  function failingRepository(): TenantRepository {
    return {
      findByEmbedKey: () => Promise.reject(new Error("ECONNREFUSED: simulated Postgres outage")),
      findById: () => Promise.reject(new Error("ECONNREFUSED: simulated Postgres outage")),
    };
  }

  it("maps tenant-lookup-failed to 503, distinct from every other reason's 403 — a database outage must not be misdiagnosed as a config error at 3am (design §2.5)", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, await deps({ repository: failingRepository() }));
    expect(result.status).toBe(503);
    const body = JSON.parse(result.body) as { error: string };
    expect(body.error).toBe("tenant-lookup-failed");
  });

  it("still maps unknown-tenant/origin-not-allowed/tenant-not-active to 403, not 503 — only the lookup-failure reason gets the different status", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_does_not_exist");
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, await deps());
    expect(result.status).toBe(403);
  });
});

describe("handleEmbedRequest — structured refusal log (task 6.8, design §10/spec Domain D: 'what happened at 14:32', NEVER a persisted row)", () => {
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

  it("logs one structured line naming the reason and the embed key for a refused request — this function's own return value is the ONLY place that reason ever travels; nothing here calls a database write", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, await deps({ validUntil: Date.now() - 1000 }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("tenant-not-active");
    expect(warnings[0]).toContain("pk_live_t_a");
  });

  it("logs nothing at all for a successful mint — the log line is a REFUSAL diagnostic, not a traffic audit trail", async () => {
    const url = new URL("https://play.hexdev/embed?k=pk_live_t_a");
    const result = await handleEmbedRequest(url, ALLOWED_ORIGIN, CLIENT_IP, await deps());
    expect(result.status).toBe(200);
    expect(warnings).toEqual([]);
  });
});
