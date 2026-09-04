import { describe, expect, it } from "vitest";
import type { OperatorDraft, OperatorId, OperatorRecord, OperatorRepository } from "./operator-repository.js";

/**
 * Executable conformance suite for `OperatorRepository` — same discipline
 * `tenant-repository.contract.ts`/`tenant-admin.contract.ts` already
 * establish (tasks §8a.8): "an adapter that passes the in-memory adapter's
 * own contract tests is worth more than bespoke tests." Both
 * `operator-repository.test.ts` (static in-memory) and
 * `postgres-operator-repository.postgres.test.ts` (real Postgres) run this
 * EXACT suite.
 *
 * Deliberately narrow for THIS slice (8a): only what task 8a.8 names —
 * "created operator findable by username; duplicate refused." Disable,
 * re-enable, permission grants and sessions all belong to later slices
 * (Phase 9/11/12) and are not exercised here. `create` seeds the ADAPTER with
 * full `OperatorRecord`s, not drafts — mirrors `tenant-admin.contract.ts`'s
 * own shape, so a test can control the pre-existing state directly instead
 * of bootstrapping it through `create` itself.
 */
export function describeOperatorRepositoryContract(name: string, create: (seed: readonly OperatorRecord[]) => Promise<OperatorRepository>): void {
  const ana: OperatorRecord = { id: "op-ana" as OperatorId, username: "ana", passwordHash: "scrypt$32768$8$1$c2FsdA==$a2V5", enabled: true };

  describe(`OperatorRepository contract — ${name}`, () => {
    it("a created operator is findable by username (spec Domain J: routine account creation)", async () => {
      const repo = await create([]);
      const draft: OperatorDraft = { id: "op-beto" as OperatorId, username: "beto", passwordHash: "scrypt$32768$8$1$b3RoZXI=$a2V5Mg==" };
      const result = await repo.create(draft);
      expect(result).toEqual({ ok: true, operator: { ...draft, enabled: true } });
      expect(await repo.findByUsername("beto")).toEqual({ ...draft, enabled: true });
    });

    it("an unknown username resolves to undefined, not a rejection (mirrors TenantRepository's own read contract)", async () => {
      const repo = await create([ana]);
      expect(await repo.findByUsername("nobody")).toBeUndefined();
    });

    it("refuses a duplicate username on create, storing no second record (spec Domain J: 'a duplicate username is refused')", async () => {
      const repo = await create([ana]);
      const result = await repo.create({ id: "op-someone-else" as OperatorId, username: ana.username, passwordHash: "scrypt$32768$8$1$b3RoZXI=$a2V5Mw==" });
      expect(result).toEqual({ ok: false, reason: "username-taken" });
      expect(await repo.findByUsername(ana.username)).toEqual(ana);
    });

    it("refuses a duplicate id on create, distinctly from a duplicate username", async () => {
      const repo = await create([ana]);
      const result = await repo.create({ id: ana.id, username: "someone-else", passwordHash: "scrypt$32768$8$1$b3RoZXI=$a2V5NA==" });
      expect(result).toEqual({ ok: false, reason: "operator-id-taken" });
    });
  });
}
