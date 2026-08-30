import { describe, expect, it } from "vitest";
import type { GameId } from "@hexdev/platform-contract";
import type { CatalogEntry } from "./bootstrap-data.js";
import { groupByFamily } from "./game-families.js";
import { groupBySection } from "./game-sections.js";

/* Every fixture declares its own `section` explicitly. The 18 `CatalogEntry`
 * fixtures this package already had all carry `section: "cartas"` — one
 * shelf, matching the four real modules — so no existing fixture yields two
 * sections by accident and none of them can prove anything about ordering. */
const entry = (id: string, gameFamily: string, section: string, seatCount = 2): CatalogEntry => ({
  id: id as GameId,
  gameFamily,
  section,
  displayNameKey: `games.${gameFamily}.name`,
  seatCount,
  configOptions: [],
});

describe("groupBySection — the shelf above the game, composed from the family grouping rather than replacing it", () => {
  it("a catalog on one shelf is one section holding every family, in catalog order", () => {
    const sections = groupBySection([
      entry("truco-argentino", "truco", "cartas"),
      entry("truco-argentino-2v2", "truco", "cartas", 4),
      entry("escoba-de-15", "escoba", "cartas"),
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe("cartas");
    expect(sections[0]?.families.map((f) => f.id), "and the families inside it keep the catalog's own order").toEqual(["truco", "escoba"]);
    expect(sections[0]?.families[0]?.entries.map((e) => e.id), "every way of playing truco survives the trip through the section tier").toEqual([
      "truco-argentino",
      "truco-argentino-2v2",
    ]);
  });

  /* THE ORDER IS THE CATALOG'S, one tier up — the same decision
   * `game-families.ts:21-23` already records for families. A section takes
   * the position of its FIRST entry, so what a player sees first is what the
   * server chose to serve first.
   *
   * The ids are deliberately reverse-sorted: `"zz-fichas"` appears first in
   * the catalog and `"aa-cartas"` second, so an implementation that sorts —
   * by id, or by anything else alphabetical — produces a DIFFERENT order and
   * this assertion fails. With one section, or with two whose ids happen to
   * sort into catalog order, a sort passes unnoticed. */
  it("sections come back in FIRST-APPEARANCE order, and the fixture's ids sort the other way round", () => {
    const sections = groupBySection([
      entry("escoba-de-15", "escoba", "zz-fichas"),
      entry("truco-argentino", "truco", "aa-cartas"),
      entry("truco-argentino-2v2", "truco", "aa-cartas", 4),
    ]);

    expect(sections.map((s) => s.id)).toEqual(["zz-fichas", "aa-cartas"]);
    expect([...sections.map((s) => s.id)].sort(), "the fixture really does sort the other way, so the assertion above can actually fail").toEqual([
      "aa-cartas",
      "zz-fichas",
    ]);
  });

  /* Interleaving separates "group" from "chunk consecutive runs": a catalog
   * is not guaranteed to keep a section's entries adjacent, and an
   * implementation that only merged neighbours would render `cartas` twice. */
  it("groups entries whose sections are not adjacent in the catalog", () => {
    const sections = groupBySection([
      entry("truco-argentino", "truco", "cartas"),
      entry("escoba-de-15", "escoba", "fichas"),
      entry("truco-argentino-2v2", "truco", "cartas", 4),
    ]);

    expect(sections.map((s) => s.id)).toEqual(["cartas", "fichas"]);
    expect(sections[0]?.families).toHaveLength(1);
    expect(sections[0]?.families[0]?.entries.map((e) => e.id)).toEqual(["truco-argentino", "truco-argentino-2v2"]);
  });

  it("an empty catalog is no sections, never a section of nothing", () => {
    expect(groupBySection([])).toEqual([]);
  });

  /* THE STRADDLE, on the client's own terms. `createGameModuleRegistry`
   * throws at composition time when one family resolves to two sections
   * (platform-core's fence), so this shape cannot reach a real catalog. This
   * function does not get to ASSUME that: the two mechanisms are orthogonal,
   * and a client that depended on the server's fence for its own totality
   * would be one deploy away from picking a winner silently.
   *
   * So it renders the family under BOTH shelves. Degraded, and honest:
   * nothing is dropped and no entry's declaration is discarded. Grouping
   * families first and reading a section off `entries[0]` would produce
   * exactly the `.find()`-picks-a-winner shape `game-families.ts` exists to
   * keep out. */
  it("a family whose entries declare two different sections appears under BOTH, never once", () => {
    const sections = groupBySection([entry("a", "x", "cartas"), entry("b", "x", "fichas")]);

    expect(sections.map((s) => s.id)).toEqual(["cartas", "fichas"]);
    expect(sections.map((s) => s.families.map((f) => f.id)), "the family is in both shelves — no winner picked").toEqual([["x"], ["x"]]);
    expect(sections[0]?.families[0]?.entries.map((e) => e.id), "each shelf holds only the entries that declared it").toEqual(["a"]);
    expect(sections[1]?.families[0]?.entries.map((e) => e.id)).toEqual(["b"]);
  });

  /* Spec Domain B, "Grouping loses nothing" — asserted as the property that
   * actually holds, not as that scenario words it. It claims the
   * concatenation of the sections' families equals `groupByFamily(c)` with
   * the "same order, no duplicates, no omissions".
   *
   * The order half is FALSE, and this fixture is built to show it rather than
   * argue it: three families across two interleaved shelves reorder, because
   * a shelf collects every family that declared it, wherever they sat in the
   * catalog. Nothing is lost by that — it is what grouping IS — and no screen
   * ever reads the flattened list, which is why this is a spec correction and
   * not a defect. What actually survives is MEMBERSHIP: every family is on
   * some shelf, and every entry is on exactly one. */
  it("loses nothing, but does REORDER: membership survives grouping, the flattened order does not", () => {
    const catalog = [entry("a", "x", "s1"), entry("b", "y", "s2"), entry("c", "z", "s1")];

    const families = groupBySection(catalog).flatMap((s) => s.families);

    expect([...families.map((f) => f.id)].sort(), "every family groupByFamily finds is on some shelf, and none twice").toEqual(
      [...groupByFamily(catalog).map((f) => f.id)].sort(),
    );
    expect([...families.flatMap((f) => f.entries).map((e) => e.id)].sort(), "and every entry is on exactly one shelf").toEqual(
      [...catalog.map((e) => e.id)].sort(),
    );
    expect(families.map((f) => f.id), "the spec's 'same order' claim, falsified: s1 collects x and z, so y moves last").toEqual(["x", "z", "y"]);
    expect(groupByFamily(catalog).map((f) => f.id), "while groupByFamily keeps the catalog's own order").toEqual(["x", "y", "z"]);
  });
});
