import type { ConfigOption, GameId } from "@hexdev/platform-contract";
import type { GameModuleRegistry } from "@hexdev/platform-core";

/** What the widget's game-selection screen needs to render one entry — the
 * platform-level slice of `GameMetadata`/`ConfigOption`, never a truco
 * specific field (spec: "Server-Enforced Per-Tenant Game Catalog"). */
export interface CatalogEntry {
  readonly id: GameId;
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
      displayNameKey: module.metadata.displayNameKey,
      seatCount: module.metadata.seatCount,
      configOptions: module.configOptions,
    });
  }
  return entries;
}
