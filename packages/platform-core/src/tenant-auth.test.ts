import { describe, expect, it } from "vitest";
import type { PlayerId } from "@hexdev/platform-contract";
import {
  createJtiReplayGuard,
  createSessionTokenIssuer,
  createStaticTenantRepository,
  mintSessionForEmbed,
} from "./tenant-auth.js";
import type { TenantId } from "./tenant-auth.js";

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

describe("createSessionTokenIssuer", () => {
  it("verify recovers exactly the claims mint issued, plus jti/exp", async () => {
    const issuer = createSessionTokenIssuer("test-secret");
    const token = await issuer.mint({ tenantId, playerId, entitlements: ["truco-argentino"] }, 120);
    const claims = await issuer.verify(token);
    expect(claims?.tenantId).toBe(tenantId);
    expect(claims?.playerId).toBe(playerId);
    expect(claims?.entitlements).toEqual(["truco-argentino"]);
  });

  it("rejects a token whose signature was tampered with", async () => {
    const issuer = createSessionTokenIssuer("test-secret");
    const token = await issuer.mint({ tenantId, playerId, entitlements: [] }, 120);
    const tampered = corruptSignature(token);
    expect(await issuer.verify(tampered)).toBeUndefined();
  });

  it("rejects an already-expired token", async () => {
    const issuer = createSessionTokenIssuer("test-secret");
    const token = await issuer.mint({ tenantId, playerId, entitlements: [] }, -1);
    expect(await issuer.verify(token)).toBeUndefined();
  });

  it("a token signed with a different secret is rejected", async () => {
    const issuerA = createSessionTokenIssuer("secret-a");
    const issuerB = createSessionTokenIssuer("secret-b");
    const token = await issuerA.mint({ tenantId, playerId, entitlements: [] }, 120);
    expect(await issuerB.verify(token)).toBeUndefined();
  });
});

function fakeClock(startMs = 0) {
  let now = startMs;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("createJtiReplayGuard (bounded, obs 2945: unbounded in-memory growth was the last open memory-exhaustion vector)", () => {
  it("accepts a jti once, then rejects the same jti as a replay", () => {
    const guard = createJtiReplayGuard({ ttlMs: 120_000 });
    expect(guard.consume("jti-1")).toBe(true);
    expect(guard.consume("jti-1")).toBe(false);
  });

  it("still rejects a replay partway through the TTL window, not just immediately", () => {
    const clock = fakeClock();
    const guard = createJtiReplayGuard({ ttlMs: 120_000, clock: clock.now });
    expect(guard.consume("jti-1")).toBe(true);
    clock.advance(119_999);
    expect(guard.consume("jti-1")).toBe(false);
  });

  it("evicts a jti once its TTL elapses, using the injected clock — never real time", () => {
    const clock = fakeClock();
    const guard = createJtiReplayGuard({ ttlMs: 120_000, clock: clock.now });
    expect(guard.consume("jti-1")).toBe(true);
    clock.advance(120_000);
    // the token this jti belonged to has itself already expired by now — a
    // jti cannot be replayed against an expired token, so re-accepting it
    // here is safe, not a regression of the replay guarantee.
    expect(guard.consume("jti-1")).toBe(true);
  });

  it("bounds tracked-jti memory under a flood of minted-and-used tokens: stale entries are swept once maxTrackedKeys is reached", () => {
    const clock = fakeClock();
    const guard = createJtiReplayGuard({ ttlMs: 100, clock: clock.now, maxTrackedKeys: 3 });
    for (let i = 0; i < 3; i += 1) guard.consume(`jti-${i}`);
    expect(guard.size()).toBe(3);
    clock.advance(200); // every tracked jti's TTL has now elapsed
    guard.consume("jti-new"); // size >= maxTrackedKeys triggers a sweep before insertion
    expect(guard.size()).toBe(1); // the 3 stale entries were evicted, only the fresh one remains
  });
});

describe("mintSessionForEmbed", () => {
  it("mints a verifiable token for a known tenant loading from an allowed origin", async () => {
    const repository = createStaticTenantRepository([record]);
    const issuer = createSessionTokenIssuer("test-secret");
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
    const issuer = createSessionTokenIssuer("test-secret");
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
    const issuer = createSessionTokenIssuer("test-secret");
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
