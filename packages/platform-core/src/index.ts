export type { GameModuleRegistration, GameModuleRegistry, SystemActionRequester } from "./registry.js";
export { createGameModuleRegistry } from "./registry.js";
export type { RateLimiter, RateLimiterOptions } from "./rate-limiter.js";
export { createRateLimiter } from "./rate-limiter.js";
export type { LobbyDisplayEntry, MatchmakingPool, ModalityConfig, Pairing, PresenceSweeper, PresenceSweeperOptions, WaitingPlayer } from "./presence.js";
export { GLOBAL_POOL_KEY, createMatchmakingPool, createPresenceSweeper, deriveLobbyDisplay, deriveModalities, modalityKey } from "./presence.js";
export type {
  EmbedMintResult,
  JtiReplayGuard,
  JtiReplayGuardOptions,
  SessionTokenClaims,
  SessionTokenIssuer,
  TenantId,
  TenantRecord,
  TenantRepository,
} from "./tenant-auth.js";
export {
  createJtiReplayGuard,
  createSessionTokenIssuer,
  createStaticTenantRepository,
  mintSessionForEmbed,
} from "./tenant-auth.js";

