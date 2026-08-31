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
export { findTenantRecordListProblem } from "./tenant-record-shape.js";
export {
  createJtiReplayGuard,
  createSessionTokenIssuer,
  createSessionTokenVerifier,
  createStaticTenantRepository,
  deriveTestSessionSigningKey,
  mintSessionForEmbed,
  renewSessionForWidget,
} from "./tenant-auth.js";

