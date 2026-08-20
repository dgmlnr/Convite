import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { PlayerId } from "@hexdev/platform-contract";
import {
  createJtiReplayGuard,
  createSessionTokenIssuer,
  createSessionTokenVerifier,
  createStaticTenantRepository,
  deriveTestSessionSigningKey,
  mintSessionForEmbed,
  renewSessionForWidget,
} from "./tenant-auth.js";
import type { TenantId, TenantRecord } from "./tenant-auth.js";
import { describeJtiReplayGuardContract } from "./jti-replay-guard.contract.js";

/** Flips one character in the MIDDLE of the signature segment — not the
 * last character, whose base64url encoding can carry unused padding bits
 * that don't always change the decoded byte, making a last-char flip an
 * unreliable (flaky) tamper proof. */
function corruptSignature(token: string): string {
  const dot = token.indexOf(".");
  const signature = token.slice(dot + 1);
  const mid = Math.floor(signature.length / 2);
  const replacement = signature[mid] === "a" ? "b" : "a";
  return `${token.slice(0, dot + 1 + mid)}${replacement}${signature.slice(mid + 1)}`;
}

/** Same idea as `corruptSignature`, but flips a byte inside the PAYLOAD
 * segment instead — a distinct attack shape (tamper the claims, not the
 * signature bytes) that a signature-only tamper test does not cover. */
function corruptPayload(token: string): string {
  const dot = token.indexOf(".");
  const payload = token.slice(0, dot);
  const mid = Math.floor(payload.length / 2);
  const replacement = payload[mid] === "a" ? "b" : "a";
  return `${payload.slice(0, mid)}${replacement}${payload.slice(mid + 1)}${token.slice(dot)}`;
}

const tenantId = "tenant-a" as TenantId;
const playerId = "player-a" as PlayerId;
const record = {
  id: tenantId,
  embedKey: "pk_live_t_a",
  allowedOrigins: ["https://tenant-a.example"],
  entitledGames: ["truco-argentino"],
};

describe("createStaticTenantRepository", () => {
  it("resolves a tenant by its embed key", () => {
    const repo = createStaticTenantRepository([record]);
    expect(repo.findByEmbedKey("pk_live_t_a")).toEqual(record);
  });

  it("resolves a tenant by its id, and returns undefined for an unknown one", () => {
    const repo = createStaticTenantRepository([record]);
    expect(repo.findById(tenantId)).toEqual(record);
    expect(repo.findById("does-not-exist" as TenantId)).toBeUndefined();
  });
});

describe("createStaticTenantRepository — theme sanitization (design §10 primary path: server-delivered, per-tenant brand theming)", () => {
  it("keeps a tenant's validly-shaped theme tokens, reachable off the stored record", () => {
    const themed = { ...record, theme: { "--gx-color-primary": "#336699", "--gx-radius": "8px" } };
    const repo = createStaticTenantRepository([themed]);
    expect(repo.findByEmbedKey("pk_live_t_a")?.theme).toEqual({ "--gx-color-primary": "#336699", "--gx-radius": "8px" });
  });

  it("a tenant with no theme configured has no theme on the stored record — theming is optional, this is today's unchanged path", () => {
    const repo = createStaticTenantRepository([record]);
    expect(repo.findByEmbedKey("pk_live_t_a")?.theme).toBeUndefined();
  });

  it("drops a hostile theme value (a CSS-injection attempt) rather than storing it — HEXDEV_TENANTS_JSON is deployment input, validated exactly like a host page's own override", () => {
    const hostile = { ...record, theme: { "--gx-color-primary": "javascript:alert(1)" } };
    const repo = createStaticTenantRepository([hostile]);
    expect(repo.findByEmbedKey("pk_live_t_a")?.theme).toEqual({});
  });

  it("drops a key outside the closed vocabulary, including a prototype-pollution-shaped one — the loop stays driven by the vocabulary, never by the input's own keys", () => {
    // `as unknown as TenantRecord`: deliberately NOT type-safe, mirroring how
    // a real hostile value actually arrives at runtime —
    // `apps/server/src/config.ts` reads `HEXDEV_TENANTS_JSON` via
    // `JSON.parse(...) as readonly TenantRecord[]`, a bare TYPE ASSERTION
    // that lies about runtime shape, never a real check. A test that only
    // ever passed genuinely-typed objects would not exercise the case this
    // repository construction step exists to guard against.
    const hostile = { ...record, theme: { "--gx-not-a-real-token": "#000000", __proto__: { polluted: true } } } as unknown as TenantRecord;
    const repo = createStaticTenantRepository([hostile]);
    expect(repo.findByEmbedKey("pk_live_t_a")?.theme).toEqual({});
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("treats a malformed (non-object) theme value as no theme, rather than throwing", () => {
    const malformed = { ...record, theme: "not-an-object" } as unknown as TenantRecord;
    const repo = createStaticTenantRepository([malformed]);
    expect(repo.findByEmbedKey("pk_live_t_a")?.theme).toBeUndefined();
  });
});

describe("createStaticTenantRepository — theme CONTRAST validation (WCAG AA, the second question a colour has to answer)", () => {
  // Shape validation asks "can this string escape the declaration it is
  // assigned into". Contrast asks "can a human read the result". Both are
  // properties of a value that arrived through `HEXDEV_TENANTS_JSON`, and
  // this repository construction is the one choke point every `TenantRecord`
  // passes through, so both are checked in the same place for the same
  // reason. `validateThemeContrast` is REUSED from `@hexdev/widget-protocol`,
  // never reimplemented — same instruction the sanitizer above already obeys.
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

  it("drops the audit's dark tenant accent while keeping every pair that passes — a partial drop, so a tenant loses only the colour that was actually unreadable", () => {
    const hostile = {
      ...record,
      theme: { "--gx-color-surface": "#ffffff", "--gx-color-on-surface": "#1a1a1a", "--gx-color-accent": "#123456" },
    };

    const repo = createStaticTenantRepository([hostile]);

    expect(repo.findByEmbedKey("pk_live_t_a")?.theme).toEqual({ "--gx-color-surface": "#ffffff", "--gx-color-on-surface": "#1a1a1a" });
  });

  it("says so out loud at construction, naming the tenant, the pair and the measured ratio", () => {
    // BOOT-LOUD, NOT BOOT-FATAL, and the difference is argued rather than
    // assumed: this file's own `sanitizeTenantTheme` already established that
    // "malformed deploy config must not crash the whole repository over one
    // tenant's bad value", and a colour is the weakest possible reason to
    // refuse to serve every OTHER tenant in the same JSON. But the sanitizer's
    // drop-silently posture leaves an operator with a brand that quietly did
    // not apply and no way to find out why, so the drop is announced with
    // everything needed to fix it in one line.
    createStaticTenantRepository([{ ...record, theme: { "--gx-color-accent": "#123456" } }]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("tenant-a");
    expect(warnings[0]).toContain("accent/ink");
    expect(warnings[0]).toContain("1.37:1");
    expect(warnings[0]).toContain("--gx-color-accent");
  });

  it("never throws over a colour — including a shape-valid but MALFORMED one, and one tenant's bad brand must not stop the repository or any OTHER tenant in the same deploy config from being built", () => {
    // `hsl(.,50%,50%)` passes COLOR_PATTERN (the `.` is inside its numeric
    // class) and parses to a NaN hue. Without a finite guard that crashed the
    // whole repository construction — every tenant in one HEXDEV_TENANTS_JSON
    // taken down by one typo. This fixture is what makes the promise in this
    // test's own name something it actually exercises.
    const hostile = {
      ...record,
      id: "tenant-hostile" as TenantId,
      embedKey: "pk_live_hostile",
      theme: { "--gx-color-accent": "#123456", "--gx-color-surface": "hsl(.,50%,50%)", "--gx-color-on-surface": "#f2f2f2" },
    };
    const healthy = { ...record, theme: { "--gx-color-accent": "#e8c877" } };

    const repo = createStaticTenantRepository([hostile, healthy]);

    expect(repo.findByEmbedKey("pk_live_hostile")?.theme).toEqual({});
    expect(repo.findByEmbedKey("pk_live_t_a")?.theme).toEqual({ "--gx-color-accent": "#e8c877" });
  });

  it("stays silent for a tenant whose theme passes — a warning that fires for healthy config is a warning nobody reads", () => {
    createStaticTenantRepository([{ ...record, theme: { "--gx-color-surface": "#1c1c1c", "--gx-color-on-surface": "#f2f2f2" } }]);

    expect(warnings).toEqual([]);
  });
});

describe("createSessionTokenIssuer (Ed25519/EdDSA — see this file's own docstring for why this replaced the prior shared-HMAC-secret design)", () => {
  it("verify recovers exactly the claims mint issued, plus jti/exp", async () => {
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
    const token = await issuer.mint({ tenantId, playerId, entitlements: ["truco-argentino"] }, 120);
    const claims = await issuer.verify(token);
    expect(claims?.tenantId).toBe(tenantId);
    expect(claims?.playerId).toBe(playerId);
    expect(claims?.entitlements).toEqual(["truco-argentino"]);
  });

  it("rejects a token whose signature was tampered with", async () => {
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
    const token = await issuer.mint({ tenantId, playerId, entitlements: [] }, 120);
    const tampered = corruptSignature(token);
    expect(await issuer.verify(tampered)).toBeUndefined();
  });

  it("rejects a token whose payload was tampered with", async () => {
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
    const token = await issuer.mint({ tenantId, playerId, entitlements: [] }, 120);
    const tampered = corruptPayload(token);
    expect(await issuer.verify(tampered)).toBeUndefined();
  });

  it("rejects an already-expired token", async () => {
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
    const token = await issuer.mint({ tenantId, playerId, entitlements: [] }, -1);
    expect(await issuer.verify(token)).toBeUndefined();
  });

  it("a token signed with a different signing key is rejected", async () => {
    const issuerA = await createSessionTokenIssuer(await deriveTestSessionSigningKey("secret-a"));
    const issuerB = await createSessionTokenIssuer(await deriveTestSessionSigningKey("secret-b"));
    const token = await issuerA.mint({ tenantId, playerId, entitlements: [] }, 120);
    expect(await issuerB.verify(token)).toBeUndefined();
  });

  it("returns undefined for a malformed/garbage token instead of throwing", async () => {
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
    await expect(issuer.verify("not-a-token-at-all")).resolves.toBeUndefined();
    await expect(issuer.verify("")).resolves.toBeUndefined();
    await expect(issuer.verify("..")).resolves.toBeUndefined();
    await expect(issuer.verify("!!!not-base64url!!!.also-not-base64url!!!")).resolves.toBeUndefined();
  });

  it("two independent issuers built from the SAME signing key mint/verify interoperably — the property a horizontally-scaled fleet relies on", async () => {
    const signingKey = await deriveTestSessionSigningKey("shared-across-instances");
    const instanceA = await createSessionTokenIssuer(signingKey);
    const instanceB = await createSessionTokenIssuer(signingKey);
    const token = await instanceA.mint({ tenantId, playerId, entitlements: ["truco-argentino"] }, 120);
    const claims = await instanceB.verify(token);
    expect(claims?.playerId).toBe(playerId);
  });

  it("refuses to construct from a malformed signing key (wrong byte length after decoding) — the crypto-layer half of 'refuses to boot'", async () => {
    await expect(createSessionTokenIssuer("not-a-valid-32-byte-seed")).rejects.toThrow(/malformed/i);
    await expect(createSessionTokenIssuer("")).rejects.toThrow(/malformed/i);
  });

  it("derives a stable, reusable public key alongside the signer", async () => {
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
    expect(typeof issuer.publicKey).toBe("string");
    expect(issuer.publicKey.length).toBeGreaterThan(0);
  });
});

describe("createSessionTokenVerifier — the genuinely mint-incapable construction (the whole point of moving off HMAC)", () => {
  it("verifies a token minted by the matching issuer", async () => {
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
    const verifier = await createSessionTokenVerifier(issuer.publicKey);
    const token = await issuer.mint({ tenantId, playerId, entitlements: ["truco-argentino"] }, 120);
    const claims = await verifier.verify(token);
    expect(claims?.playerId).toBe(playerId);
  });

  it("rejects a token minted by a DIFFERENT issuer's key, exactly like a full issuer would", async () => {
    const issuerA = await createSessionTokenIssuer(await deriveTestSessionSigningKey("secret-a"));
    const issuerB = await createSessionTokenIssuer(await deriveTestSessionSigningKey("secret-b"));
    const verifierForA = await createSessionTokenVerifier(issuerA.publicKey);
    const token = await issuerB.mint({ tenantId, playerId, entitlements: [] }, 120);
    expect(await verifierForA.verify(token)).toBeUndefined();
  });

  it("has NO mint method at all at runtime — not merely hidden by typing", async () => {
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
    const verifier = await createSessionTokenVerifier(issuer.publicKey);
    expect("mint" in verifier).toBe(false);
    expect(Object.keys(verifier)).toEqual(["verify"]);
    // @ts-expect-error — the whole thesis of this construction: TypeScript
    // itself refuses to let a caller reach a mint capability that was never
    // returned, not merely one that is inconvenient to call.
    expect(typeof verifier.mint).toBe("undefined");
  });

  it("refuses to construct from a malformed public key (wrong byte length)", async () => {
    await expect(createSessionTokenVerifier("not-a-valid-32-byte-key")).rejects.toThrow(/malformed/i);
    await expect(createSessionTokenVerifier("")).rejects.toThrow(/malformed/i);
  });
});

function fakeClock(startMs = 0) {
  let now = startMs;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("createJtiReplayGuard (bounded, obs 2945: unbounded in-memory growth was the last open memory-exhaustion vector)", () => {
  it("accepts a jti once, then rejects the same jti as a replay", async () => {
    const guard = createJtiReplayGuard({ ttlMs: 120_000 });
    expect(await guard.consume("jti-1")).toBe(true);
    expect(await guard.consume("jti-1")).toBe(false);
  });

  it("still rejects a replay partway through the TTL window, not just immediately", async () => {
    const clock = fakeClock();
    const guard = createJtiReplayGuard({ ttlMs: 120_000, clock: clock.now });
    expect(await guard.consume("jti-1")).toBe(true);
    clock.advance(119_999);
    expect(await guard.consume("jti-1")).toBe(false);
  });

  it("evicts a jti once its TTL elapses, using the injected clock — never real time", async () => {
    const clock = fakeClock();
    const guard = createJtiReplayGuard({ ttlMs: 120_000, clock: clock.now });
    expect(await guard.consume("jti-1")).toBe(true);
    clock.advance(120_000);
    // the token this jti belonged to has itself already expired by now — a
    // jti cannot be replayed against an expired token, so re-accepting it
    // here is safe, not a regression of the replay guarantee.
    expect(await guard.consume("jti-1")).toBe(true);
  });

  it("bounds tracked-jti memory under a flood of minted-and-used tokens: stale entries are swept once maxTrackedKeys is reached", async () => {
    const clock = fakeClock();
    const guard = createJtiReplayGuard({ ttlMs: 100, clock: clock.now, maxTrackedKeys: 3 });
    for (let i = 0; i < 3; i += 1) await guard.consume(`jti-${i}`);
    expect(await guard.size()).toBe(3);
    clock.advance(200); // every tracked jti's TTL has now elapsed
    await guard.consume("jti-new"); // size >= maxTrackedKeys triggers a sweep before insertion
    expect(await guard.size()).toBe(1); // the 3 stale entries were evicted, only the fresh one remains
  });
});

// The shared conformance suite (jti-replay-guard.contract.ts), run here
// against THIS adapter — the same suite `redis-jti-replay-guard.live.test.ts`
// runs against the Redis adapter. See rate-limiter.test.ts's own comment for
// why a single shared clock backs every `create()` call.
{
  const sharedClock = fakeClock();
  describeJtiReplayGuardContract(
    "in-memory",
    (ttlMs) => createJtiReplayGuard({ ttlMs, clock: sharedClock.now }),
    async (ms) => {
      sharedClock.advance(ms);
    },
  );
}

describe("mintSessionForEmbed", () => {
  it("mints a verifiable token for a known tenant loading from an allowed origin", async () => {
    const repository = createStaticTenantRepository([record]);
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
    const result = await mintSessionForEmbed({
      repository,
      issuer,
      embedKey: "pk_live_t_a",
      origin: "https://tenant-a.example",
      playerId,
      ttlSeconds: 120,
    });
    expect(result.ok).toBe(true);
    const claims = result.ok ? await issuer.verify(result.token) : undefined;
    expect(claims?.tenantId).toBe(tenantId);
    expect(claims?.entitlements).toEqual(["truco-argentino"]);
  });

  it("rejects a disallowed origin and issues no token", async () => {
    const repository = createStaticTenantRepository([record]);
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
    const result = await mintSessionForEmbed({
      repository,
      issuer,
      embedKey: "pk_live_t_a",
      origin: "https://evil.example",
      playerId,
      ttlSeconds: 120,
    });
    expect(result).toEqual({ ok: false, reason: "origin-not-allowed" });
  });

  it("rejects an unknown embed key", async () => {
    const repository = createStaticTenantRepository([record]);
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
    const result = await mintSessionForEmbed({
      repository,
      issuer,
      embedKey: "pk_does_not_exist",
      origin: "https://tenant-a.example",
      playerId,
      ttlSeconds: 120,
    });
    expect(result).toEqual({ ok: false, reason: "unknown-tenant" });
  });
});

describe("renewSessionForWidget (obs 2968: the bootstrap token is minted at PAGE-LOAD time but only used at PLAY time — a player who reads for minutes before clicking play needs a FRESH token, not a longer-lived one)", () => {
  const WIDGET_ORIGIN = "https://play.hexdev.example";

  it("mints a fresh, verifiable token for a known tenant when the request's own origin is an allowed WIDGET origin (never the tenant's host-page allowlist)", async () => {
    const repository = createStaticTenantRepository([record]);
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
    const result = await renewSessionForWidget({
      repository,
      issuer,
      embedKey: "pk_live_t_a",
      origin: WIDGET_ORIGIN,
      allowedWidgetOrigins: [WIDGET_ORIGIN],
      playerId,
      ttlSeconds: 120,
    });
    expect(result.ok).toBe(true);
    const claims = result.ok ? await issuer.verify(result.token) : undefined;
    expect(claims?.tenantId).toBe(tenantId);
    expect(claims?.entitlements).toEqual(["truco-argentino"]);
  });

  it("rejects a request whose origin is NOT one of this server's own widget origins, even though it exactly matches the tenant's host-page allowlist", async () => {
    const repository = createStaticTenantRepository([record]);
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
    const result = await renewSessionForWidget({
      repository,
      issuer,
      embedKey: "pk_live_t_a",
      origin: record.allowedOrigins[0]!, // the TENANT's page origin — must NOT be accepted here
      allowedWidgetOrigins: [WIDGET_ORIGIN],
      playerId,
      ttlSeconds: 120,
    });
    expect(result).toEqual({ ok: false, reason: "origin-not-allowed" });
  });

  it("rejects an unknown embed key", async () => {
    const repository = createStaticTenantRepository([record]);
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
    const result = await renewSessionForWidget({
      repository,
      issuer,
      embedKey: "pk_does_not_exist",
      origin: WIDGET_ORIGIN,
      allowedWidgetOrigins: [WIDGET_ORIGIN],
      playerId,
      ttlSeconds: 120,
    });
    expect(result).toEqual({ ok: false, reason: "unknown-tenant" });
  });

  it("mints against CURRENT tenant entitlements, not any stale copy — same freshness guarantee mintSessionForEmbed already has", async () => {
    const currentRecord = { ...record, entitledGames: ["truco-argentino", "escoba"] };
    const repository = createStaticTenantRepository([currentRecord]);
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("test-secret"));
    const result = await renewSessionForWidget({
      repository,
      issuer,
      embedKey: "pk_live_t_a",
      origin: WIDGET_ORIGIN,
      allowedWidgetOrigins: [WIDGET_ORIGIN],
      playerId,
      ttlSeconds: 120,
    });
    const claims = result.ok ? await issuer.verify(result.token) : undefined;
    expect(claims?.entitlements).toEqual(["truco-argentino", "escoba"]);
  });
});
