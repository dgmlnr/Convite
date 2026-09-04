import { describe, expect, it } from "vitest";
import type { OperatorDraft, OperatorId, OperatorRecord, OperatorRepository, OperatorWriteWitness } from "./operator-repository.js";

/**
 * Executable conformance suite for `OperatorRepository` — same discipline
 * `tenant-repository.contract.ts`/`tenant-admin.contract.ts` already
 * establish (tasks §8a.8): "an adapter that passes the in-memory adapter's
 * own contract tests is worth more than bespoke tests." Both
 * `operator-repository.test.ts` (static in-memory) and
 * `postgres-operator-repository.postgres.test.ts` (real Postgres) run this
 * EXACT suite.
 *
 * Extended at task 11a for `findById`/`updatePassword` and `create`'s new
 * witness parameter. Still deliberately narrow: `disable`/`enable` are NOT
 * exercised here — see `operator-repository.ts`'s own docstring for why they
 * are standalone Postgres-bound functions (`operator-lifecycle.ts`) rather
 * than port methods this contract could cover. `create` seeds the ADAPTER
 * with full `OperatorRecord`s, not drafts — mirrors `tenant-admin.contract.ts`'s
 * own shape, so a test can control the pre-existing state directly instead
 * of bootstrapping it through `create` itself. Every inline witness runs
 * `exec("SELECT 1", [])`, same "genuinely harmless SQL, not a placeholder
 * string" discipline `tenant-admin.contract.ts`'s own docstring establishes,
 * since the Postgres adapter now runs a witness's `exec` for REAL on a
 * successful write.
 */
export function describeOperatorRepositoryContract(name: string, create: (seed: readonly OperatorRecord[]) => Promise<OperatorRepository>): void {
  const ana: OperatorRecord = { id: "op-ana" as OperatorId, username: "ana", passwordHash: "scrypt$32768$8$1$c2FsdA==$a2V5", enabled: true };
  const noopWitness: OperatorWriteWitness = async (exec) => exec("SELECT 1", []);

  function countingWitness(): { readonly witness: OperatorWriteWitness; calls: number } {
    const state = { calls: 0 };
    const witness: OperatorWriteWitness = async (exec) => {
      state.calls += 1;
      await exec("SELECT 1", []);
    };
    return { witness, get calls() { return state.calls; } };
  }

  describe(`OperatorRepository contract — ${name}`, () => {
    it("a created operator is findable by username (spec Domain J: routine account creation)", async () => {
      const repo = await create([]);
      const draft: OperatorDraft = { id: "op-beto" as OperatorId, username: "beto", passwordHash: "scrypt$32768$8$1$b3RoZXI=$a2V5Mg==" };
      const result = await repo.create(draft, noopWitness);
      expect(result).toEqual({ ok: true, operator: { ...draft, enabled: true } });
      expect(await repo.findByUsername("beto")).toEqual({ ...draft, enabled: true });
    });

    it("an unknown username resolves to undefined, not a rejection (mirrors TenantRepository's own read contract)", async () => {
      const repo = await create([ana]);
      expect(await repo.findByUsername("nobody")).toBeUndefined();
    });

    it("a created operator is also findable by id (task 11a: own-password/operator-lookup needs)", async () => {
      const repo = await create([ana]);
      expect(await repo.findById(ana.id)).toEqual(ana);
      expect(await repo.findById("does-not-exist" as OperatorId)).toBeUndefined();
    });

    it("refuses a duplicate username on create, storing no second record (spec Domain J: 'a duplicate username is refused')", async () => {
      const repo = await create([ana]);
      const result = await repo.create({ id: "op-someone-else" as OperatorId, username: ana.username, passwordHash: "scrypt$32768$8$1$b3RoZXI=$a2V5Mw==" }, noopWitness);
      expect(result).toEqual({ ok: false, reason: "username-taken" });
      expect(await repo.findByUsername(ana.username)).toEqual(ana);
    });

    it("refuses a duplicate id on create, distinctly from a duplicate username", async () => {
      const repo = await create([ana]);
      const result = await repo.create({ id: ana.id, username: "someone-else", passwordHash: "scrypt$32768$8$1$b3RoZXI=$a2V5NA==" }, noopWitness);
      expect(result).toEqual({ ok: false, reason: "operator-id-taken" });
    });

    it("updatePassword replaces passwordHash, findable afterward through the SAME read port (task 11a.11)", async () => {
      const repo = await create([ana]);
      const result = await repo.updatePassword(ana.id, "scrypt$32768$8$1$bmV3$a2V5bmV3", noopWitness);
      expect(result).toEqual({ ok: true });
      expect((await repo.findById(ana.id))?.passwordHash).toBe("scrypt$32768$8$1$bmV3$a2V5bmV3");
    });

    it("refuses updatePassword against an unknown operator id", async () => {
      const repo = await create([]);
      const result = await repo.updatePassword("does-not-exist" as OperatorId, "scrypt$32768$8$1$bmV3$a2V5bmV3", noopWitness);
      expect(result).toEqual({ ok: false, reason: "unknown-operator" });
    });

    it("calls the write witness exactly once per successful write, zero times per refused write (design §2.3 point 4, same discipline as TenantAdminRepository)", async () => {
      const repo = await create([ana]);
      const success = countingWitness();
      const draft: OperatorDraft = { id: "op-fresh" as OperatorId, username: "fresh", passwordHash: "scrypt$32768$8$1$b3RoZXI=$a2V5" };
      expect((await repo.create(draft, success.witness)).ok).toBe(true);
      expect(success.calls).toBe(1);

      const refusal = countingWitness();
      const duplicate = await repo.create({ id: "op-dup" as OperatorId, username: ana.username, passwordHash: "scrypt$32768$8$1$b3RoZXI=$a2V5" }, refusal.witness);
      expect(duplicate.ok).toBe(false);
      expect(refusal.calls).toBe(0);
    });
  });
}
