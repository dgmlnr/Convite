/**
 * `OperatorRepository` (spec Domain J, design §3/§4, tasks 8a.7-8a.9):
 * everything needed to CREATE and LOOK UP an operator account by username.
 * Deliberately narrow for slice 8a — disabling, permission grants, and
 * sessions all belong to later slices (Phase 9, PR11, PR12) and are not
 * modeled here. Lives in `packages/platform-core`, behind the Node-only
 * `node.ts` barrel, same placement as `TenantAdminRepository`
 * (`tenant-admin.ts`) — the established shape for every write-capable port
 * in this fleet (decision 1.4).
 *
 * `operator-password.ts` (`apps/admin`) never appears here: this port stores
 * an OPAQUE `passwordHash` string it never interprets — hashing lives one
 * layer up, in `apps/admin`, which is the only app allowed to know scrypt
 * parameters exist (design §11.1). `platform-core` must not depend on
 * `apps/admin` in either direction; an opaque string is what keeps that true.
 */

/** Branded string, same idiom as `TenantId` (`tenant-auth.ts:7`). */
export type OperatorId = string & { readonly __brand: "OperatorId" };

export interface OperatorRecord {
  readonly id: OperatorId;
  readonly username: string;
  /** Opaque to this port — see this module's own docstring. Only
   * `operator-password.ts` (`apps/admin`) ever produces or reads its shape. */
  readonly passwordHash: string;
  readonly enabled: boolean;
}

/** Everything a `create` needs to hand in. `enabled` is NOT here: every
 * freshly created operator starts enabled (spec Domain J's bootstrap/
 * provisioning scenarios never create a pre-disabled account) — disabling is
 * always a SEPARATE, later action, once that route exists (PR11). */
export type OperatorDraft = Pick<OperatorRecord, "id" | "username" | "passwordHash">;

/**
 * Discriminated result, mirroring `TenantWriteResult`'s own shape on purpose
 * (design §2.3 point 1) — continuity over invention. A duplicate username or
 * id is expected form input from an authorized operator provisioning a
 * colleague (spec Domain J), not a server fault.
 */
export type CreateOperatorResult = { readonly ok: true; readonly operator: OperatorRecord } | { readonly ok: false; readonly reason: "operator-id-taken" | "username-taken" };

export interface OperatorRepository {
  findByUsername(username: string): Promise<OperatorRecord | undefined>;
  create(draft: OperatorDraft): Promise<CreateOperatorResult>;
}

/**
 * In-memory `OperatorRepository`, the fast Docker-free adapter under
 * `pnpm test` — same role `createStaticTenantAdminRepository` already plays
 * for its own contract (`tenant-admin.ts`).
 */
export function createStaticOperatorRepository(initial: readonly OperatorRecord[]): OperatorRepository {
  const byId = new Map(initial.map((operator) => [operator.id, operator]));
  const byUsername = new Map(initial.map((operator) => [operator.username, operator]));

  return {
    async findByUsername(username) {
      return byUsername.get(username);
    },
    async create(draft) {
      if (byId.has(draft.id)) return { ok: false, reason: "operator-id-taken" };
      if (byUsername.has(draft.username)) return { ok: false, reason: "username-taken" };
      const operator: OperatorRecord = { ...draft, enabled: true };
      byId.set(operator.id, operator);
      byUsername.set(operator.username, operator);
      return { ok: true, operator };
    },
  };
}
