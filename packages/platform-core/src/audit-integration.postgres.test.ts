import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { PlayerId } from "@hexdev/platform-contract";
import { createSessionTokenIssuer, createStaticTenantRepository, deriveTestSessionSigningKey, mintSessionForEmbed, type TenantId } from "./tenant-auth.js";
import { connectPostgres } from "./postgres-client.js";
import { createPostgresTenantRepository } from "./postgres-tenant-repository.js";
import { readPostgresTestUrl } from "./postgres-test-harness.js";

/**
 * Tasks 10.10/10.11, design §10/spec Domain L's OWN boundary — stated twice
 * (once in the enforcement domain, Domain D, once in the audit domain,
 * Domain L) so neither can drift while the other is read alone. This is the
 * CLOSING proof, run against a real Postgres `TenantRepository` rather than
 * the static in-memory one `tenant-auth.test.ts` already exercises this
 * refusal shape against — the point is not "does `mintSessionForEmbed`
 * refuse correctly" (already proven, slice 6), it is "does refusing ever
 * leave a row in `audit_entries`", and that table only exists as of THIS
 * slice's migration 004.
 *
 * TASK 10.11's OWN "no code change expected if the boundary held": there is
 * no production code path connecting `mintSessionForEmbed`/`resolveActiveTenant`
 * (packages/platform-core) to `audit_entries` at all — `appendAuditEntry`
 * lives in `apps/admin`, an L3 app neither `mint-server` nor `server` (this
 * function's own callers) can import (design §10 layers 1-2, tasks
 * 10.7-10.9). This test is the RUNTIME closing proof of a boundary the
 * COMPILE-TIME/BOUNDARY layers already make structurally near-unreachable —
 * passing it confirms the boundary holds in practice, it does not itself
 * require or produce a code change.
 *
 * THREE DISTINCT REFUSAL REASONS in one burst — not merely repeating the
 * same one — so this proof does not accidentally depend on which specific
 * refusal path executes: an unknown embed key (`unknown-tenant`), a real
 * but never-activated tenant (`tenant-not-active`, design §1.3's own "zero
 * window = inactive"), and a real tenant hit from a disallowed origin
 * (`origin-not-allowed`).
 */
let pool: Pool;
const playerId = "player-audit-boundary" as PlayerId;

beforeAll(async () => {
  pool = await connectPostgres(readPostgresTestUrl());
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  // Truncated locally, not globally: this is the ONLY file in the postgres
  // suite that needs a clean `audit_entries` count, and `fileParallelism:
  // false` (vitest.postgres.config.ts) means no other file's assertions run
  // concurrently with this one and could be disturbed by it.
  await pool.query("TRUNCATE TABLE tenants, audit_entries RESTART IDENTITY CASCADE");
  // TWO tenants, deliberately: an ACTIVE one is required to reach the
  // ORIGIN check at all (`resolveActiveTenant` checks `isTenantActive`
  // BEFORE the origin check, design §2.4's fixed order) — reusing the
  // inactive tenant for the foreign-origin case would only ever produce
  // `tenant-not-active` again, never actually exercising `origin-not-allowed`.
  await pool.query("INSERT INTO tenants (id, embed_key, allowed_origins, entitled_games) VALUES ($1, $2, $3, $4)", [
    "tenant-audit-boundary-inactive" as TenantId,
    "pk_live_audit_boundary_inactive",
    ["https://tenant-audit-boundary.example"],
    ["truco-argentino"],
  ]);
  await pool.query("INSERT INTO tenants (id, embed_key, allowed_origins, entitled_games, valid_until) VALUES ($1, $2, $3, $4, $5)", [
    "tenant-audit-boundary-active" as TenantId,
    "pk_live_audit_boundary_active",
    ["https://tenant-audit-boundary.example"],
    ["truco-argentino"],
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  ]);
});

describe("mintSessionForEmbed refusals never reach audit_entries (tasks 10.10/10.11, design §10, spec Domain L/D boundary)", () => {
  it("a burst of refusals across three distinct reasons leaves audit_entries at zero rows", async () => {
    const repository = createPostgresTenantRepository(pool);
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("audit-boundary-test-secret"));
    const burstSize = 25;

    const results = await Promise.all(
      Array.from({ length: burstSize }, (_, i) => {
        const args = { repository, issuer, playerId, ttlSeconds: 120 } as const;
        if (i % 3 === 0) return mintSessionForEmbed({ ...args, embedKey: "pk_live_does_not_exist", origin: "https://tenant-audit-boundary.example" });
        if (i % 3 === 1) return mintSessionForEmbed({ ...args, embedKey: "pk_live_audit_boundary_inactive", origin: "https://tenant-audit-boundary.example" });
        return mintSessionForEmbed({ ...args, embedKey: "pk_live_audit_boundary_active", origin: "https://evil.example" });
      }),
    );

    // Sanity: the burst actually refused every attempt, and touched all
    // three reasons — a burst that accidentally minted (or refused for only
    // ONE reason) would prove nothing about the boundary this test exists
    // to check.
    expect(results.every((r) => !r.ok)).toBe(true);
    const reasons = new Set(results.map((r) => (r.ok ? undefined : r.reason)));
    expect(reasons).toEqual(new Set(["unknown-tenant", "tenant-not-active", "origin-not-allowed"]));

    const { rows } = await pool.query<{ count: string }>("SELECT count(*) FROM audit_entries");
    expect(Number(rows[0]!.count)).toBe(0);
  });

  it("the same burst against the STATIC in-memory repository is refused identically — confirms the boundary is a property of mintSessionForEmbed itself, not an accident of the Postgres adapter", async () => {
    const repository = createStaticTenantRepository([
      { id: "tenant-static-boundary" as TenantId, embedKey: "pk_live_static_boundary", allowedOrigins: [], entitledGames: [] },
    ]);
    const issuer = await createSessionTokenIssuer(await deriveTestSessionSigningKey("audit-boundary-test-secret"));

    const result = await mintSessionForEmbed({ repository, issuer, playerId, ttlSeconds: 120, embedKey: "pk_live_static_boundary", origin: "https://evil.example" });

    expect(result).toEqual({ ok: false, reason: "tenant-not-active" });
    const { rows } = await pool.query<{ count: string }>("SELECT count(*) FROM audit_entries");
    expect(Number(rows[0]!.count)).toBe(0);
  });
});
