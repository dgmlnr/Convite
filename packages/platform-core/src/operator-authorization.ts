import type { OperatorId } from "./operator-repository.js";

/**
 * The shape the authorization checkpoint's one-query join resolves (design
 * §7, `apps/admin/src/authorization.ts`'s `authorize`, spec Domain K, tasks
 * 9.1-9.9) — a PURE type with no Node/Postgres dependency, the same class as
 * `OperatorRecord` (`operator-repository.ts`): it belongs on the public
 * barrel (`index.ts`), even though its only real producer
 * (`postgres-operator-authorization.ts`'s `findOperatorAuthorizationContext`)
 * stays behind `node.ts` — the identical port/adapter split every other
 * pair in this package already follows.
 *
 * NO port interface and NO static in-memory adapter exist for this shape,
 * unlike `OperatorRepository`/`OperatorSessionRepository`: the injectable
 * `AuthorizationQuery` seam `apps/admin/src/authorization.ts` already defines
 * IS that abstraction — a parallel
 * `createStaticOperatorAuthorizationRepository` would duplicate exactly what
 * that seam's own test fakes already provide.
 */
export interface OperatorAuthorizationContext {
  readonly operatorId: OperatorId;
  readonly username: string;
  readonly enabled: boolean;
  /** Epoch ms — compared through an injected `clock` one layer up
   * (`authorize`'s own discipline, design §7), never `Date.now()` read here. */
  readonly expiresAt: number;
  /** Permission strings, exactly as `operator_permissions` stores them. A
   * session with zero grants resolves to an empty array — spec Domain K's
   * own "a newly created operator holds no permissions by default" scenario
   * — never `[null]`; see `postgres-operator-authorization.ts`'s own
   * `coalesce`/`FILTER` docstring for why. */
  readonly permissions: readonly string[];
}
