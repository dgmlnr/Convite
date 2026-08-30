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

/**
 * What a player would call the game, across every way of playing it.
 *
 * A `GameId` is something to JOIN; a `GameFamilyId` is something to CHOOSE.
 * `truco-argentino` and `truco-argentino-2v2` are two of the first and one of
 * the second — separate matches, a single game. The lobby lists families; the
 * matchmaker joins ids, and entitlement stays keyed by id.
 *
 * Deliberately a distinct type from `GameId` even though both are strings:
 * they are the same shape and DIFFERENT things, and the only defence against
 * passing one where the other belongs is that the names differ where a reader
 * looks. When a game declares no family it becomes its own, so this is never
 * absent on the client side.
 */
export type GameFamilyId = string;

/**
 * The shelf a catalog is laid out on — the grouping tier ABOVE `GameFamilyId`.
 *
 * A `GameFamilyId` is something to CHOOSE; a `CatalogSectionId` is where the
 * front door puts the choices. `truco` and `escoba` are two of the first and
 * one of the second: two games, one shelf of card games.
 *
 * Deliberately a distinct type from both ids above even though all three are
 * strings, for the reason already recorded on `GameFamilyId`: they are the
 * same shape and DIFFERENT things, and the only defence against passing one
 * where another belongs is that the names differ where a reader looks.
 *
 * A bare alias and NOT a closed union of the sections that exist today: a
 * literal union here would make every new shelf a change to this package,
 * which is the enumerating-config shape this tier exists to avoid.
 */
export type CatalogSectionId = string;
