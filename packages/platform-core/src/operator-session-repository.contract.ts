import { describe, expect, it } from "vitest";
import type { OperatorId } from "./operator-repository.js";
import type { OperatorSessionRecord, OperatorSessionRepository } from "./operator-session-repository.js";

/**
 * Executable conformance suite for `OperatorSessionRepository` — same
 * discipline `operator-repository.contract.ts`/`tenant-admin.contract.ts`
 * already establish. Both `operator-session-repository.test.ts` (static
 * in-memory) and `postgres-operator-session-repository.postgres.test.ts`
 * (real Postgres) run this exact suite.
 *
 * Deliberately narrow for slice 8b: create, find, and delete a row by its
 * `tokenHash` — exactly what login (create) and logout (find-then-delete,
 * or a bare delete) need. Session EXPIRY enforcement (comparing `expiresAt`
 * against a live clock) is the authorization checkpoint's job (design §7,
 * slice 9), not this port's — this port is a plain keyed store, the same
 * division `TenantRepository` draws between "resolve the record" and
 * "`isTenantActive` decides what it means".
 */
export function describeOperatorSessionRepositoryContract(name: string, create: (seed: readonly OperatorSessionRecord[]) => Promise<OperatorSessionRepository>): void {
  const operatorId = "op-ana" as OperatorId;
  const session: OperatorSessionRecord = {
    tokenHash: "a".repeat(64),
    operatorId,
    createdAt: 1_700_000_000_000,
    expiresAt: 1_700_028_800_000,
  };

  describe(`OperatorSessionRepository contract — ${name}`, () => {
    it("a created session is findable by its token hash (design §11.2: login mints a session)", async () => {
      const repo = await create([]);
      await repo.create(session);
      expect(await repo.findByTokenHash(session.tokenHash)).toEqual(session);
    });

    it("an unknown token hash resolves to undefined, not a rejection", async () => {
      const repo = await create([]);
      expect(await repo.findByTokenHash("unknown-hash")).toBeUndefined();
    });

    it("deleting a session removes it — the exact mechanism logout relies on to make the old cookie stop working (tasks 8b.7/8b.8)", async () => {
      const repo = await create([session]);
      await repo.deleteByTokenHash(session.tokenHash);
      expect(await repo.findByTokenHash(session.tokenHash)).toBeUndefined();
    });

    it("deleting an already-absent token hash is a harmless no-op (logout is idempotent, never errors on a stale/foreign cookie)", async () => {
      const repo = await create([]);
      await expect(repo.deleteByTokenHash("never-existed")).resolves.toBeUndefined();
    });

    it("two distinct sessions for the same operator coexist independently (an operator MAY hold more than one concurrent session)", async () => {
      const second: OperatorSessionRecord = { ...session, tokenHash: "b".repeat(64) };
      const repo = await create([session, second]);
      await repo.deleteByTokenHash(session.tokenHash);
      expect(await repo.findByTokenHash(session.tokenHash)).toBeUndefined();
      expect(await repo.findByTokenHash(second.tokenHash)).toEqual(second);
    });
  });
}
