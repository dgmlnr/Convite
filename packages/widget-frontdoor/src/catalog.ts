import type { CatalogSectionId, ConfigOption, GameFamilyId, GameId } from "@hexdev/platform-contract";
import { catalogGroupingOf, type GameModuleRegistry } from "@hexdev/platform-core";

/** What the widget's game-selection screen needs to render one entry — the
 * platform-level slice of `GameMetadata`/`ConfigOption`, never a truco
 * specific field (spec: "Server-Enforced Per-Tenant Game Catalog"). */
export interface CatalogEntry {
  readonly id: GameId;
  /**
   * The game this entry is a way of playing — see `GameFamilyId`. REQUIRED
   * here even though `GameMetadata.gameFamily` is optional: `buildCatalog`
   * normalizes a missing declaration to the id itself, so every consumer past
   * this point reads a family and none of them branches on its absence.
   */
  readonly gameFamily: GameFamilyId;
  /**
   * Which shelf of the catalog this entry sits on — see `CatalogSectionId`.
   * REQUIRED here on exactly the grounds `gameFamily` above is: an undeclared
   * section is normalized to the entry's NORMALIZED FAMILY, so no consumer
   * past this point branches on its absence, and the two ways of playing one
   * game cannot end up on two shelves by omission.
   */
  readonly section: CatalogSectionId;
  readonly displayNameKey: string;
  readonly seatCount: number;
  readonly configOptions: readonly ConfigOption[];
}

/**
 * Derives the tenant-scoped catalog `/embed` returns (design §7's bootstrap
 * payload) from a tenant's raw `entitledGames` and the registry that knows
 * which of those ids are actually wired up. This is the DATA the client-side
 * catalog filtering (spec: "Client-side catalog filtering is UX-only") reads
 * from — the room-join server-side gate in `MatchRoom.onAuth` remains the
 * real enforcement, unchanged by this function.
 *
 * An entitled id with no registered module is silently dropped rather than
 * thrown on: a tenant contract can legitimately name a game before its
 * `GameModule` ships, and `/embed` must not 500 over that gap.
 */
export function buildCatalog(entitledGames: readonly GameId[], registry: GameModuleRegistry): readonly CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const gameId of entitledGames) {
    const module = registry.get(gameId);
    if (module === undefined) continue;
    entries.push({
      id: gameId,
      // BOTH grouping keys come from `catalogGroupingOf`, and the `??` that
      // used to sit right here is gone rather than duplicated: a game that
      // declares no family is a family of one named after itself, and one
      // that declares no shelf takes its family's. The composition-time
      // straddle fence in `createGameModuleRegistry` needs that identical
      // answer, and the day two copies of the rule disagree the fence passes
      // while this function puts the wrong thing on the wire.
      ...catalogGroupingOf(gameId, module.metadata),
      displayNameKey: module.metadata.displayNameKey,
      seatCount: module.metadata.seatCount,
      configOptions: module.configOptions,
    });
  }
  return entries;
}
