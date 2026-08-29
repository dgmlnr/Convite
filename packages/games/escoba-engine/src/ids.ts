/**
 * Branded identifiers, kept LOCAL to this package — escoba-engine is L0
 * (design §D1, mirrors truco-engine's own tier: `l0-game-engine-no-
 * workspace-deps`, verified in Slice C, forbids importing `PlayerId`/
 * `TeamId` from `@hexdev/platform-contract` or `@hexdev/truco-engine` from
 * here). Re-declared exactly like `truco-engine/src/ids.ts` — same brand
 * shape, deliberately not imported, same reasoning as `card.ts`'s own
 * header comment.
 */
export type PlayerId = string & { readonly __brand: "PlayerId" };
export type TeamId = string & { readonly __brand: "TeamId" };
