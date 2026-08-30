import type { CatalogSectionId, GameFamilyId, GameId, GameMetadata } from "@hexdev/platform-contract";

/** The two grouping keys a catalog entry is filed under, both resolved — no
 * `undefined`, no caller left to decide what an absent declaration means. */
export interface CatalogGrouping {
  readonly gameFamily: GameFamilyId;
  readonly section: CatalogSectionId;
}

/**
 * Resolves BOTH of `GameMetadata`'s optional grouping keys, and is the only
 * place either resolution lives.
 *
 * OPTIONAL IN, REQUIRED OUT — the rule `GameMetadata.gameFamily` has stated
 * since it landed, now applied to `section` as well and, more importantly,
 * applied in ONE function. `buildCatalog` used to carry `gameFamily ?? gameId`
 * inline; the composition-time straddle fence in `createGameModuleRegistry`
 * needs the identical answer in a different package. Two copies of one rule is
 * a hardcoded fact about what is true today that nothing re-checks, and the
 * day they disagree the fence passes while the wire lies.
 *
 * THE FALLBACKS CHAIN, AND THE ORDER IS THE POINT. A missing family is the
 * game's own id: a game that declares no family is a family of one, named
 * after itself. A missing section is that NORMALIZED FAMILY — never the id.
 * `truco-argentino` and `truco-argentino-2v2` are two ways of playing one
 * game, so falling back to the id would file them on two different shelves
 * named after themselves, splitting in half exactly the thing the family tier
 * exists to keep whole.
 *
 * Lives in `platform-core` rather than `platform-contract` — where the rule is
 * DOCUMENTED — because that package exports exactly one runtime value today, a
 * test harness, and this would be its first production runtime export shipped
 * into a server bundle. `widget-frontdoor` already imports `platform-core` for
 * `GameModuleRegistry`, so nothing new is opened.
 */
export function catalogGroupingOf(gameId: GameId, metadata: GameMetadata): CatalogGrouping {
  const gameFamily = metadata.gameFamily ?? gameId;
  return { gameFamily, section: metadata.section ?? gameFamily };
}
