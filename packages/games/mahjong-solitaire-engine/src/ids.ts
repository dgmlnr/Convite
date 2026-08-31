/**
 * The seated player's identifier, kept LOCAL to this package. Re-declared
 * exactly like `escoba-engine/src/ids.ts` and `truco-engine/src/ids.ts`, for
 * exactly their reason: `l0-game-engine-no-workspace-deps` forbids a game
 * engine every workspace import, so `PlayerId` cannot be imported from
 * `@hexdev/platform-contract` even though that is where the platform's own
 * copy lives. Same brand shape, deliberately not imported, so a module can
 * pass the platform's ids straight through.
 */
export type PlayerId = string & { readonly __brand: "PlayerId" };
