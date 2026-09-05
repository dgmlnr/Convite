import type { OperatorId } from "./operator-repository.js";

/**
 * `OperatorSessionRepository` (spec Domain E, design §3/§4/§11.2, tasks
 * 8b.1-8b.2/8b.7-8b.8): create and delete rows in `operator_sessions`. Lives
 * in `packages/platform-core`, behind the Node-only `node.ts` barrel for its
 * Postgres adapter (same placement as `OperatorRepository`, decision 1.4).
 *
 * `tokenHash` is the ONLY thing this port ever stores — never the raw cookie
 * value (design §3: "a database dump is then not a set of live sessions").
 * Hashing the raw token happens one layer up, in `apps/admin` (the same
 * boundary `operator-password.ts`'s own docstring draws for scrypt) — this
 * port never sees, produces, or interprets the raw token at all.
 *
 * Deliberately narrow for slice 8b: `create` (login), `findByTokenHash`
 * (logout needs to know a row existed before it can honestly report it
 * deleted one, and the shared contract needs it to observe state), and
 * `deleteByTokenHash` (logout). There is NO `deleteByOperatorId` here —
 * "disabling an account invalidates every live session it holds" is spec
 * Domain J/design §7, the authorization checkpoint's own territory (slice 9),
 * not this slice's. Adding it now would be scope creep this task list
 * explicitly warns against ("no permission checks yet").
 */
export interface OperatorSessionRecord {
  readonly tokenHash: string;
  readonly operatorId: OperatorId;
  /** Epoch ms, via the injected `Clock` at the call site — never `Date.now()`
   * read inside this port itself, same discipline `tenant-validity.ts`'s own
   * choke points already establish. */
  readonly createdAt: number;
  readonly expiresAt: number;
}

export interface OperatorSessionRepository {
  create(session: OperatorSessionRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<OperatorSessionRecord | undefined>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
}

/**
 * In-memory `OperatorSessionRepository`, the fast Docker-free adapter under
 * `pnpm test` — same role `createStaticOperatorRepository` plays for its own
 * contract.
 */
export function createStaticOperatorSessionRepository(initial: readonly OperatorSessionRecord[] = []): OperatorSessionRepository {
  const byTokenHash = new Map(initial.map((session) => [session.tokenHash, session]));

  return {
    async create(session) {
      byTokenHash.set(session.tokenHash, session);
    },
    async findByTokenHash(tokenHash) {
      return byTokenHash.get(tokenHash);
    },
    async deleteByTokenHash(tokenHash) {
      byTokenHash.delete(tokenHash);
    },
  };
}
