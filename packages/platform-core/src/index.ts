export type { GameModuleRegistration, GameModuleRegistry, SystemActionRequester } from "./registry.js";
export { createGameModuleRegistry } from "./registry.js";
export type {
  EmbedMintResult,
  JtiReplayGuard,
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

