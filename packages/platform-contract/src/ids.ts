/**
 * A platform-wide player identifier. Branded with the exact same structural
 * shape `truco-engine` uses for its own `PlayerId` (`string` intersected
 * with `{ readonly __brand: "PlayerId" }`), so a game module can pass its own
 * engine's ids straight through with no cast — TypeScript compares branded
 * types structurally, not nominally, so two identically shaped brands from
 * different packages are interchangeable by design here.
 */
export type PlayerId = string & { readonly __brand: "PlayerId" };

/** Stable catalog identifier for a game, e.g. `"truco-argentino"`. */
export type GameId = string;
