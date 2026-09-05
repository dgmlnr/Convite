/**
 * `OperatorRepository` (spec Domain J, design §3/§4, tasks 8a.7-8a.9,
 * 11a.2/11a.10-11a.11): everything needed to CREATE, LOOK UP, and update the
 * credential of an operator account. Lives in `packages/platform-core`,
 * behind the Node-only `node.ts` barrel, same placement as
 * `TenantAdminRepository` (`tenant-admin.ts`) — the established shape for
 * every write-capable port in this fleet (decision 1.4).
 *
 * `operator-password.ts` (`apps/admin`) never appears here: this port stores
 * an OPAQUE `passwordHash` string it never interprets — hashing lives one
 * layer up, in `apps/admin`, which is the only app allowed to know scrypt
 * parameters exist (design §11.1). `platform-core` must not depend on
 * `apps/admin` in either direction; an opaque string is what keeps that true.
 *
 * DELIBERATELY STILL NARROW, even after this slice (11a): `disable`/`enable`
 * are NOT port methods here. Both require the last-account-manager guard
 * (`last-account-manager.ts`, design §8) transactionally coupled to their own
 * mutation, and disabling additionally must delete every live session for
 * that operator IN THE SAME TRANSACTION (spec Domain J: re-enabling must not
 * resurrect a session invalidated while disabled) — a cross-table,
 * guard-carrying operation this port's own STATIC in-memory adapter has no
 * faithful way to model, since it tracks neither `operator_permissions` nor
 * `operator_sessions`. They live instead as standalone, Postgres-bound
 * functions in `operator-lifecycle.ts`, the same "no port, no static double
 * when the mechanism is unavoidably Postgres-native" precedent
 * `postgres-operator-authorization.ts`'s own docstring already establishes
 * for `findOperatorAuthorizationContext`.
 *
 * `create`/`updatePassword` DO take a `WriteWitness`-shaped `w` parameter,
 * unlike PR9b's original `create` — every mutating operator-account write
 * must be auditable (design §9), the identical retrofit
 * `postgres-tenant-admin-repository.ts` already went through at task 10.6.
 * Declared LOCALLY as `OperatorWriteWitness`, not imported from
 * `tenant-admin.ts`, mirroring `apps/admin/src/audit-log.ts`'s own
 * `AuditExec` precedent: TypeScript's structural typing needs no shared
 * declaration for one witness-building closure to satisfy every port that
 * shares this exact callback shape.
 */

/** Structurally identical to `tenant-admin.ts`'s own `WriteWitness` — see
 * this module's own docstring for why it is declared here rather than
 * imported. */
export type OperatorWriteWitness = (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => Promise<void>;

/** The no-op `exec` the STATIC in-memory adapter passes to `w` — identical
 * role to `tenant-admin.ts`'s own `NOOP_EXEC`, for the identical reason: a
 * `Map` mutation has no transaction to roll a witness's failure back into. */
const NOOP_EXEC: (sql: string, values: readonly unknown[]) => Promise<void> = async () => {};

/** `updatePassword` has nothing new to hand back beyond success/failure —
 * unlike `create`, which already returns the created record via
 * `CreateOperatorResult`, so this result carries no payload on success. */
export type OperatorMutationResult = { readonly ok: true } | { readonly ok: false; readonly reason: "unknown-operator" };

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
  /** Added task 11a's own own-password/operator-lookup needs (`operator-handlers.ts`,
   * `own-password-handler.ts` both need to resolve the ACTING operator's own
   * current record by id — `authorize`'s own `AuthorizedOperator` carries an
   * id and a permission set, never a password hash). */
  findById(id: OperatorId): Promise<OperatorRecord | undefined>;
  create(draft: OperatorDraft, w: OperatorWriteWitness): Promise<CreateOperatorResult>;
  /** Task 11a.11: routine self-service password change. Refuses with
   * `unknown-operator` only in the theoretical case the acting operator's own
   * row vanished between authorization and this call — never reachable
   * through the panel's own UI, but a real repository must still answer
   * honestly rather than silently no-op. */
  updatePassword(id: OperatorId, passwordHash: string, w: OperatorWriteWitness): Promise<OperatorMutationResult>;
}

/**
 * In-memory `OperatorRepository`, the fast Docker-free adapter under
 * `pnpm test` — same role `createStaticTenantAdminRepository` already plays
 * for its own contract (`tenant-admin.ts`). `create`/`updatePassword` call
 * `w(NOOP_EXEC)` exactly like `createStaticTenantAdminRepository`'s own
 * mutating methods — a fast, Docker-free contract-test double, never a
 * production path, so it has no transaction for a witness's failure to roll
 * back into.
 */
export function createStaticOperatorRepository(initial: readonly OperatorRecord[]): OperatorRepository {
  const byId = new Map(initial.map((operator) => [operator.id, operator]));
  const byUsername = new Map(initial.map((operator) => [operator.username, operator]));

  return {
    async findByUsername(username) {
      return byUsername.get(username);
    },
    async findById(id) {
      return byId.get(id);
    },
    async create(draft, w) {
      if (byId.has(draft.id)) return { ok: false, reason: "operator-id-taken" };
      if (byUsername.has(draft.username)) return { ok: false, reason: "username-taken" };
      const operator: OperatorRecord = { ...draft, enabled: true };
      byId.set(operator.id, operator);
      byUsername.set(operator.username, operator);
      await w(NOOP_EXEC);
      return { ok: true, operator };
    },
    async updatePassword(id, passwordHash, w) {
      const existing = byId.get(id);
      if (existing === undefined) return { ok: false, reason: "unknown-operator" };
      const operator: OperatorRecord = { ...existing, passwordHash };
      byId.set(operator.id, operator);
      byUsername.set(operator.username, operator);
      await w(NOOP_EXEC);
      return { ok: true };
    },
  };
}
