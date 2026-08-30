import type { CatalogSectionId } from "@hexdev/platform-contract";
import type { CatalogEntry } from "./bootstrap-data.js";
import { groupByFamily, type GameFamily } from "./game-families.js";

/**
 * A shelf of the catalog, with the games laid out on it.
 *
 * One tier above `GameFamily`, and the same seam: the catalog lists things to
 * JOIN, `groupByFamily` collapses those into the games a player CHOOSES, and
 * this collapses those into the shelves the front door lays them out on.
 * `truco` and `escoba` are two games and one shelf of card games.
 */
export interface GameSection {
  readonly id: CatalogSectionId;
  /** In catalog order, which is the order the server chose to serve them —
   * `groupByFamily`'s own rule, carried through unchanged. */
  readonly families: readonly GameFamily[];
}

/**
 * Collapse catalog entries into the shelves they sit on.
 *
 * COMPOSES `groupByFamily`, never inspects it. Each section's entries are
 * handed to it as a filtered slice of the catalog, so its "order is the
 * catalog's, no scan, no first-wins" promise carries into every shelf
 * verbatim — `game-families.ts` is not edited by a single line to make this
 * work, which is the whole point of taking entries rather than families.
 *
 * IT TAKES `CatalogEntry[]`, NOT `GameFamily[]`, and that is the decision the
 * rest of this file follows from. A `GameFamily` carries no section, so a
 * signature over families would force this function to choose one from its
 * entries — `entries[0].section` is the `.find()` that used to pick the
 * lobby's identity, wearing a different hat.
 *
 * ORDER IS THE CATALOG'S. A section takes the position of its first entry,
 * exactly as a family does. Nothing sorts: an alphabetical shelf order is an
 * accident nobody chose, and the order a tenant is served in is a server
 * decision the client has no standing to overrule.
 *
 * TOTAL, AND IT PICKS NOTHING. Both keys are read off the ENTRY, which
 * `buildCatalog` normalizes so neither is ever absent. A family whose entries
 * declare two different sections therefore appears under BOTH — degraded, but
 * honest: nothing is dropped and no declaration is discarded. That shape is
 * fenced off at composition time by `createGameModuleRegistry`, and this
 * function deliberately does not rely on that: two orthogonal mechanisms,
 * neither depending on the other to stay correct.
 */
export function groupBySection(catalog: readonly CatalogEntry[]): readonly GameSection[] {
  const bySection = new Map<CatalogSectionId, CatalogEntry[]>();
  for (const entry of catalog) {
    const existing = bySection.get(entry.section);
    if (existing === undefined) bySection.set(entry.section, [entry]);
    else existing.push(entry);
  }
  return [...bySection].map(([id, entries]) => ({ id, families: groupByFamily(entries) }));
}
