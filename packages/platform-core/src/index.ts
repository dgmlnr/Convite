export type { AbandonedSeatActionProvider, GameModuleRegistration, GameModuleRegistry, NonBlockingActionClassifier, ConsultAdviceProvider, ConsultAskProvider, PaidQuestionClassifier, SystemActionRequester } from "./registry.js";
export { createGameModuleRegistry } from "./registry.js";
export type { CatalogGrouping } from "./catalog-grouping.js";
export { catalogGroupingOf } from "./catalog-grouping.js";
export type { RateLimiter, RateLimiterOptions } from "./rate-limiter.js";
export { createRateLimiter } from "./rate-limiter.js";
export type { RedisRateLimiterOptions } from "./redis-rate-limiter.js";
// `connectRedis` is deliberately NOT here: it is a VALUE import of ioredis,
// and this barrel is reachable from the browser bundle. It lives behind
// `@hexdev/platform-core/node`. See that file for the regression this split
// exists to prevent.
export { createRedisRateLimiter } from "./redis-rate-limiter.js";
export type { RedisJtiReplayGuardOptions } from "./redis-jti-replay-guard.js";
export { createRedisJtiReplayGuard } from "./redis-jti-replay-guard.js";
export type { LobbyDisplayEntry, MatchmakingPool, ModalityConfig, PresenceSweeper, PresenceSweeperOptions, RawModalityCount, SeatGroup, WaitingPlayer } from "./presence.js";
export { GLOBAL_POOL_KEY, createMatchmakingPool, createPresenceSweeper, deriveLobbyDisplay, deriveLobbyDisplayFromCounts, deriveModalities, modalityKey } from "./presence.js";
export type { RedisMatchmakingPoolOptions } from "./redis-matchmaking-pool.js";
export { createRedisMatchmakingPool } from "./redis-matchmaking-pool.js";
export type {
  EmbedMintResult,
  JtiReplayGuard,
  JtiReplayGuardOptions,
  SessionTokenClaims,
  SessionTokenIssuer,
  SessionTokenIssuerHandle,
  SessionTokenSigner,
  SessionTokenVerifier,
  TenantId,
  TenantRecord,
  TenantRepository,
} from "./tenant-auth.js";
export {
  createJtiReplayGuard,
  createSessionTokenIssuer,
  createSessionTokenVerifier,
  createStaticTenantRepository,
  deriveTestSessionSigningKey,
  mintSessionForEmbed,
  renewSessionForWidget,
} from "./tenant-auth.js";
// `OperatorRepository`/`OperatorSessionRepository` (tenant-administration
// slices 8a/8b): both ports and their static in-memory adapters are pure —
// no Node-only dependency, same class as `TenantRepository` above — so they
// belong on THIS public barrel. Their Postgres adapters
// (`createPostgresOperatorRepository`/`createPostgresOperatorSessionRepository`)
// stay behind `node.ts`, same split. First real consumer:
// `apps/admin/src/login-handler.ts`/`logout-handler.ts` (slice 8b, PR10) —
// built in PR9 but unconsumed until now, which is why these exports were not
// added until this PR.
export type { CreateOperatorResult, OperatorDraft, OperatorId, OperatorMutationResult, OperatorRecord, OperatorRepository, OperatorWriteWitness } from "./operator-repository.js";
export { createStaticOperatorRepository } from "./operator-repository.js";
// `OperatorLifecycleResult`/`OperatorLifecycleGuardedResult` (PR13, slice
// 11a): the return shapes of `disableOperator`/`enableOperator`
// (`node.ts`, Postgres-bound) — PURE types with no Node/Postgres dependency
// of their own, same class as `CreateOperatorResult` above, so they belong
// on THIS public barrel even though their only producers stay behind
// `node.ts`.
export type { OperatorLifecycleGuardedResult, OperatorLifecycleResult } from "./operator-lifecycle.js";
export type { OperatorSessionRecord, OperatorSessionRepository } from "./operator-session-repository.js";
export { createStaticOperatorSessionRepository } from "./operator-session-repository.js";
// `OperatorAuthorizationContext` (tenant-administration slice 9, design §7):
// a PURE type with no Node/Postgres dependency of its own — same class as
// `OperatorRecord` above — so it belongs on THIS public barrel even though
// its only producer (`findOperatorAuthorizationContext`) stays behind
// `node.ts`, the same port/adapter split every other pair here follows.
export type { OperatorAuthorizationContext } from "./operator-authorization.js";
// `isTenantActive` (tenant-administration slice 6, design §2.4): a PURE
// function with no value import at all beyond the global `Intl` — unlike
// `connectRedis`/`connectPostgres`/the Postgres adapters (which live behind
// `node.ts` on principle, §0.4/design decision 1.4), this module has no
// Node-only dependency to keep out of a browser bundle, so it belongs on
// THIS public barrel, not the Node-only one. It is exported here rather than
// re-derived at each of the OTHER two choke points
// (`transport-colyseus/match-room.ts`, a different package) because design
// §2.4 requires "ONE implementation of the comparison, three call sites" —
// `tenant-auth.ts`'s own two choke points reach it via a same-package
// relative import instead, needing no barrel at all.
//
// VERIFIED, NOT ASSUMED — and the measurement corrected an initial WRONG
// attribution written while drafting this comment. `pnpm --filter
// @hexdev/widget-app run build`, on a clean checkout before this slice's
// first commit: 169 modules / 517.96 kB. After `tenant-auth.ts` alone
// gained `import { isTenantActive } from "./tenant-validity.js"` (the
// choke-point PR earlier in this same stack, THIS export not yet added):
// 170 modules / 518.15 kB — the exact delta first suspected to come from
// THIS barrel export. It does not: `tenant-validity.ts` carries an
// unavoidable top-level side effect (`new Intl.DateTimeFormat(...)`, module
// scope, no `/*#__PURE__*/` annotation a bundler could use to prove it
// side-effect-free), and `tenant-auth.ts` is already reachable from
// `apps/widget-app`'s dependency graph for OTHER exports — so importing
// `tenant-validity.ts` at all forces that top-level statement into the
// bundle regardless of whether `isTenantActive` itself is ever referenced.
// Rebuilding again with THIS export present measured BYTE-IDENTICAL (170
// modules / 518.15 kB) — this barrel export adds exactly zero further
// modules or bytes on top of what `tenant-auth.ts`'s own internal wiring
// already, unavoidably, pays. This is the exact class of regression
// `browser-safety.test.ts`'s own docstring warns about (`connectRedis`
// silently took `widget-app.js` from 103/285kB to 170/441kB) — checked here
// rather than presumed safe, and found to be a real but negligible (+0.037%)
// cost already paid by the enforcement itself, not by this export.
export { isTenantActive } from "./tenant-validity.js";

