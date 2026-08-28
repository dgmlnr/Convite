import type { GameFamilyId } from "@hexdev/platform-contract";
import type { CatalogEntry } from "./bootstrap-data.js";

/**
 * A game as a PLAYER names it, with every way of playing it underneath.
 *
 * The catalog lists things to JOIN: `truco-argentino` and
 * `truco-argentino-2v2` are two of those and one of these. The selection
 * screen lists games, the matchmaker joins ids, and this is the seam between
 * them.
 */
export interface GameFamily {
  readonly id: GameFamilyId;
  /** In catalog order, which is the order the server chose to serve them. */
  readonly entries: readonly CatalogEntry[];
}

/**
 * Collapse catalog entries into the games they are ways of playing.
 *
 * ORDER IS THE CATALOG'S, not this function's: a family takes the position of
 * its FIRST entry, so the screen's ordering stays a server decision rather
 * than becoming an alphabetical accident nobody chose.
 *
 * NO SCAN, NO FIRST-WINS. Grouping reads the explicit `gameFamily` every
 * entry carries (`buildCatalog` normalizes an undeclared one to the game's own
 * id), so nothing here picks a winner between entries. The lobby's identity
 * used to be decided by a `.find()` over registered entries — first with art
 * took the whole screen — and it was invisible only because both truco
 * entries carried copy-pasted art. This function exists partly so that shape
 * has nowhere to come back.
 */
export function groupByFamily(catalog: readonly CatalogEntry[]): readonly GameFamily[] {
  const byFamily = new Map<GameFamilyId, CatalogEntry[]>();
  for (const entry of catalog) {
    const existing = byFamily.get(entry.gameFamily);
    if (existing === undefined) byFamily.set(entry.gameFamily, [entry]);
    else existing.push(entry);
  }
  return [...byFamily].map(([id, entries]) => ({ id, entries }));
}
