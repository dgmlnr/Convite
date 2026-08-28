import { describe, expect, it } from "vitest";
import type { GameId } from "@hexdev/platform-contract";
import { groupByFamily } from "./game-families.js";
import type { CatalogEntry } from "./bootstrap-data.js";

const entry = (id: string, gameFamily: string, seatCount = 2): CatalogEntry => ({
  id: id as GameId,
  gameFamily,
  displayNameKey: `games.${gameFamily}.name`,
  seatCount,
  configOptions: [],
});

describe("groupByFamily — the catalog lists things to join, the screen lists games", () => {
  it("two entries of one game become one family holding both", () => {
    const families = groupByFamily([entry("truco-argentino", "truco"), entry("truco-argentino-2v2", "truco", 4)]);

    expect(families).toHaveLength(1);
    expect(families[0]?.id).toBe("truco");
    expect(families[0]?.entries.map((e) => e.id), "and both ways of playing it survive, in catalog order").toEqual(["truco-argentino", "truco-argentino-2v2"]);
  });

  it("two different games stay two families", () => {
    const families = groupByFamily([entry("truco-argentino", "truco"), entry("escoba-de-15", "escoba")]);
    expect(families.map((f) => f.id)).toEqual(["truco", "escoba"]);
  });

  /* THE ORDER IS THE CATALOG'S, and that is a decision. A family takes the
   * position of its FIRST entry, so what the player sees first is what the
   * server chose to serve first — not an alphabetical accident, and not the
   * order a Map happened to hash into. */
  it("a family takes the position of its first entry, so the screen's order stays the server's", () => {
    const families = groupByFamily([entry("escoba-de-15", "escoba"), entry("truco-argentino", "truco"), entry("truco-argentino-2v2", "truco", 4)]);

    expect(families.map((f) => f.id), "escoba came first in the catalog, so it comes first here").toEqual(["escoba", "truco"]);
  });

  /* Interleaving is the case that separates "group" from "chunk consecutive
   * runs". A catalog is not guaranteed to keep a family's entries adjacent,
   * and a naive implementation that only merged neighbours would silently
   * render truco twice. */
  it("groups entries that are not adjacent in the catalog", () => {
    const families = groupByFamily([entry("truco-argentino", "truco"), entry("escoba-de-15", "escoba"), entry("truco-argentino-2v2", "truco", 4)]);

    expect(families).toHaveLength(2);
    expect(families[0]?.entries).toHaveLength(2);
  });

  it("an empty catalog is no families, never a family of nothing", () => {
    expect(groupByFamily([])).toEqual([]);
  });
});
