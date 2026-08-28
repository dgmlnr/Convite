import type { ConfigOption, GameFamilyId, GameId } from "@hexdev/platform-contract";
import type { GameModuleRegistry } from "@hexdev/platform-core";

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
      // A game that declares no family is a family of one, named after
      // itself — the honest reading of "ungrouped", and what keeps the
      // client side of this field free of `undefined`.
      gameFamily: module.metadata.gameFamily ?? gameId,
      displayNameKey: module.metadata.displayNameKey,
      seatCount: module.metadata.seatCount,
      configOptions: module.configOptions,
    });
  }
  return entries;
}
