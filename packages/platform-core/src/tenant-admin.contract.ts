import { describe, expect, it } from "vitest";
import type { TenantAdminRepository, WriteWitness } from "./tenant-admin.js";
import type { TenantId, TenantRecord } from "./tenant-auth.js";

/**
 * Executable conformance suite for the `TenantAdminRepository` write port —
 * same discipline `tenant-repository.contract.ts`/`rate-limiter.contract.ts`
 * already establish: "an adapter that passes the in-memory adapter's own
 * contract tests is worth more than bespoke tests" (apply prompt). Both
 * `tenant-admin.test.ts` (static in-memory, default suite) and
 * `postgres-tenant-admin-repository.postgres.test.ts` (real Postgres) run
 * this EXACT suite.
 *
 * `create` seeds the ADAPTER, not a record — the fixture list it is handed
 * becomes that adapter's starting state, mirroring the read contract's own
 * shape. Genuinely async (a real Postgres seed is a round trip), unlike the
 * static factory's own synchronous construction.
 *
 * Every inline witness below runs `exec("SELECT 1", [])` — genuinely
 * harmless SQL, not a placeholder string like the pre-task-10.6 `"x"` this
 * file used to carry. Before task 10.6, `postgres-tenant-admin-repository.ts`
 * always called `w(NOOP_EXEC)` (design's own docstring), so the literal text
 * a witness passed to `exec` was never actually executed and "x" cost
 * nothing. Task 10.6 makes the Postgres adapter run a witness's `exec` for
 * REAL, inside the mutation's own transaction — on this suite's SUCCESS
 * cases (a genuinely committed write), "x" would now be a real syntax error
 * against Postgres. `countingWitness` below already used "SELECT 1"; this
 * revision makes every inline witness consistent with it.
 */
export function describeTenantAdminRepositoryContract(name: string, create: (seed: readonly TenantRecord[]) => Promise<TenantAdminRepository>): void {
  const tenantA: TenantRecord = {
    id: "tenant-a" as TenantId,
    embedKey: "pk_live_admin_a",
    allowedOrigins: ["https://tenant-a.example"],
    entitledGames: ["truco-argentino"],
  };
  const tenantB: TenantRecord = {
    id: "tenant-b" as TenantId,
    embedKey: "pk_live_admin_b",
    allowedOrigins: ["https://tenant-b.example"],
    entitledGames: ["escoba-de-15"],
  };

  function countingWitness(): { readonly witness: WriteWitness; calls: number } {
    const state = { calls: 0 };
    const witness: WriteWitness = async (exec) => {
      state.calls += 1;
      await exec("SELECT 1", []);
    };
    return { witness, get calls() { return state.calls; } };
  }

  describe(`TenantAdminRepository contract — ${name}`, () => {
    it("creates a tenant with nothing configured yet — empty allowedOrigins/entitledGames are legitimate, not forced non-empty (design §1.3)", async () => {
      const repo = await create([]);
      const draft = { id: "tenant-fresh" as TenantId, embedKey: "pk_live_fresh", allowedOrigins: [], entitledGames: [] };
      const result = await repo.create(draft, async (exec) => exec("SELECT 1", []));
      expect(result).toEqual({ ok: true, tenant: draft, themeViolations: [] });
      expect(await repo.findById("tenant-fresh" as TenantId)).toEqual(draft);
    });

    it("refuses a duplicate embedKey on create, storing no second record (spec Domain C)", async () => {
      const repo = await create([tenantA]);
      const result = await repo.create({ id: "tenant-c" as TenantId, embedKey: tenantA.embedKey, allowedOrigins: [], entitledGames: [] }, async (exec) => exec("SELECT 1", []));
      expect(result).toEqual({ ok: false, reason: "embed-key-taken" });
      expect(await repo.list()).toEqual([tenantA]);
    });

    it("refuses a duplicate id on create, distinctly from a duplicate embedKey", async () => {
      const repo = await create([tenantA]);
      const result = await repo.create({ id: tenantA.id, embedKey: "pk_live_something_else", allowedOrigins: [], entitledGames: [] }, async (exec) => exec("SELECT 1", []));
      expect(result).toEqual({ ok: false, reason: "tenant-id-taken" });
    });

    it("refuses rotating into an embedKey already in use, leaving both records unchanged (spec Domain C)", async () => {
      const repo = await create([tenantA, tenantB]);
      const result = await repo.rotateEmbedKey(tenantA.id, tenantB.embedKey, async (exec) => exec("SELECT 1", []));
      expect(result).toEqual({ ok: false, reason: "embed-key-taken" });
      expect(await repo.findById(tenantA.id)).toEqual(tenantA);
      expect(await repo.findById(tenantB.id)).toEqual(tenantB);
    });

    it("rotates into a genuinely free embedKey", async () => {
      const repo = await create([tenantA]);
      const result = await repo.rotateEmbedKey(tenantA.id, "pk_live_rotated", async (exec) => exec("SELECT 1", []));
      expect(result).toEqual({ ok: true, tenant: { ...tenantA, embedKey: "pk_live_rotated" }, themeViolations: [] });
      expect((await repo.findById(tenantA.id))?.embedKey).toBe("pk_live_rotated");
    });

    it("refuses every mutating method against an unknown tenant id", async () => {
      const repo = await create([]);
      const unknown = "does-not-exist" as TenantId;
      const witness: WriteWitness = async (exec) => exec("SELECT 1", []);
      expect(await repo.updateAllowedOrigins(unknown, [], witness)).toEqual({ ok: false, reason: "unknown-tenant" });
      expect(await repo.updateEntitledGames(unknown, [], witness)).toEqual({ ok: false, reason: "unknown-tenant" });
      expect(await repo.updateTheme(unknown, undefined, witness)).toEqual({ ok: false, reason: "unknown-tenant" });
      expect(await repo.rotateEmbedKey(unknown, "pk_live_new", witness)).toEqual({ ok: false, reason: "unknown-tenant" });
      expect(await repo.setValidityWindow(unknown, { validUntil: 1_700_000_000_000 }, witness)).toEqual({ ok: false, reason: "unknown-tenant" });
    });

    it("drops an out-of-vocabulary theme token on write, never re-sanitizing on a later read (spec Domain C, write-time sanitization)", async () => {
      const repo = await create([tenantA]);
      const result = await repo.updateTheme(tenantA.id, { "--gx-color-primary": "javascript:alert(1)" }, async (exec) => exec("SELECT 1", []));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.tenant.theme).toEqual({});
        expect(result.themeViolations).toEqual([]); // shape-invalid, not a contrast violation: dropped silently by sanitizeThemeOverride
      }
      expect((await repo.findById(tenantA.id))?.theme).toEqual({});
    });

    it("reports a contrast violation on write, dropping only the offending token", async () => {
      const repo = await create([tenantA]);
      const result = await repo.updateTheme(
        tenantA.id,
        { "--gx-color-surface": "#ffffff", "--gx-color-on-surface": "#1a1a1a", "--gx-color-accent": "#123456" },
        async (exec) => exec("SELECT 1", []),
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.tenant.theme).toEqual({ "--gx-color-surface": "#ffffff", "--gx-color-on-surface": "#1a1a1a" });
        expect(result.themeViolations).toHaveLength(1);
      }
    });

    it("setValidityWindow round-trips validFrom/validUntil through the read port (task 5.9, owed from PR5/§0.9 task 4.2's deferral)", async () => {
      const repo = await create([tenantA]);
      const validFrom = 1_700_000_000_000;
      const validUntil = 1_700_086_400_000; // one day later
      const result = await repo.setValidityWindow(tenantA.id, { validFrom, validUntil }, async (exec) => exec("SELECT 1", []));
      expect(result).toEqual({ ok: true, tenant: { ...tenantA, validFrom, validUntil }, themeViolations: [] });
      // "Through the read port": `findById` is `TenantAdminRepository`'s own
      // read method, the same one every other mutating scenario in this
      // suite already uses to confirm a write actually persisted.
      expect(await repo.findById(tenantA.id)).toEqual({ ...tenantA, validFrom, validUntil });
    });

    it("refuses an inverted window (validFrom >= validUntil), storing nothing (design §3's tenants_window_ordered, enforced at the port before any write)", async () => {
      const repo = await create([tenantA]);
      const result = await repo.setValidityWindow(tenantA.id, { validFrom: 1_700_100_000_000, validUntil: 1_700_000_000_000 }, async (exec) => exec("SELECT 1", []));
      expect(result).toEqual({ ok: false, reason: "invalid-window" });
      expect((await repo.findById(tenantA.id))?.validUntil).toBeUndefined();
    });

    it("refuses setValidityWindow against an unknown tenant id", async () => {
      const repo = await create([]);
      const result = await repo.setValidityWindow("does-not-exist" as TenantId, { validUntil: 1_700_000_000_000 }, async (exec) => exec("SELECT 1", []));
      expect(result).toEqual({ ok: false, reason: "unknown-tenant" });
    });

    it("calls the write witness exactly once per successful write, zero times per refused write (design §2.3 point 4)", async () => {
      const repo = await create([tenantA]);
      const success = countingWitness();
      const draft = { id: "tenant-fresh-2" as TenantId, embedKey: "pk_live_fresh_2", allowedOrigins: [], entitledGames: [] };
      expect((await repo.create(draft, success.witness)).ok).toBe(true);
      expect(success.calls).toBe(1);

      const refusal = countingWitness();
      const duplicate = await repo.create({ id: "tenant-dup" as TenantId, embedKey: tenantA.embedKey, allowedOrigins: [], entitledGames: [] }, refusal.witness);
      expect(duplicate.ok).toBe(false);
      expect(refusal.calls).toBe(0);
    });
  });
}
