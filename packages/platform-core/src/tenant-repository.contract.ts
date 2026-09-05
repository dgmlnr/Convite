import { describe, expect, it } from "vitest";
import type { TenantId, TenantRecord, TenantRepository } from "./tenant-auth.js";

/**
 * Executable conformance suite for the `TenantRepository` port — same
 * discipline as `rate-limiter.contract.ts`'s own docstring: "an adapter that
 * passes the in-memory adapter's own contract tests is worth more than
 * bespoke tests" (apply prompt). Both `tenant-auth.test.ts` (static
 * in-memory) and `postgres-tenant-repository.postgres.test.ts` (real
 * Postgres) run this EXACT suite — design §1's Domain B: "a record written
 * to Postgres is readable through the exact same port shape the static
 * adapter already satisfies".
 *
 * `create` is ASYNC, unlike `describeRateLimiterContract`'s synchronous
 * `create`: seeding the Postgres-backed instance under test is a real
 * INSERT, round-tripping through the network, while the static adapter's
 * own construction is synchronous and simply wraps the given records in
 * `Promise.resolve` closures.
 *
 * Theme coverage here is deliberately narrow — one "kept" and one "dropped"
 * case, not the full shape/contrast/prototype-pollution matrix
 * `tenant-auth.test.ts` already exercises exhaustively against
 * `sanitizeTenantTheme` at construction time. Both cases here go through the
 * exact same two `@hexdev/widget-protocol` primitives
 * (`sanitizeThemeOverride` + `validateThemeContrast`) that function calls, so
 * re-proving every edge a second time would test the primitives again, not
 * the port. What the port-level contract needs to prove is only that BOTH
 * adapters apply that sanitization somewhere on the path from storage to a
 * caller — see `postgres-tenant-repository.ts`'s own docstring for why the
 * Postgres adapter does it at READ time for this PR, deliberately different
 * from the static adapter's construction time.
 */
export function describeTenantRepositoryContract(name: string, create: (records: readonly TenantRecord[]) => Promise<TenantRepository>): void {
  const tenantId = "tenant-a" as TenantId;
  const record: TenantRecord = {
    id: tenantId,
    embedKey: "pk_live_t_a",
    allowedOrigins: ["https://tenant-a.example"],
    entitledGames: ["truco-argentino"],
  };

  describe(`TenantRepository contract — ${name}`, () => {
    it("resolves a tenant by its embed key", async () => {
      const repo = await create([record]);
      expect(await repo.findByEmbedKey("pk_live_t_a")).toEqual(record);
    });

    it("returns undefined, not an error, for an unknown embed key", async () => {
      const repo = await create([record]);
      expect(await repo.findByEmbedKey("pk_does_not_exist")).toBeUndefined();
    });

    it("resolves a tenant by its id, and returns undefined for an unknown one", async () => {
      const repo = await create([record]);
      expect(await repo.findById(tenantId)).toEqual(record);
      expect(await repo.findById("does-not-exist" as TenantId)).toBeUndefined();
    });

    it("a tenant with no theme configured has no theme on the stored record", async () => {
      const repo = await create([record]);
      expect((await repo.findByEmbedKey("pk_live_t_a"))?.theme).toBeUndefined();
    });

    it("keeps a tenant's validly-shaped theme tokens, reachable off the stored record", async () => {
      const themed = { ...record, theme: { "--gx-color-primary": "#336699", "--gx-radius": "8px" } };
      const repo = await create([themed]);
      expect((await repo.findByEmbedKey("pk_live_t_a"))?.theme).toEqual({ "--gx-color-primary": "#336699", "--gx-radius": "8px" });
    });

    it("drops a hostile theme value (a CSS-injection attempt) rather than serving it", async () => {
      const hostile = { ...record, theme: { "--gx-color-primary": "javascript:alert(1)" } };
      const repo = await create([hostile]);
      expect((await repo.findByEmbedKey("pk_live_t_a"))?.theme).toEqual({});
    });
  });
}
