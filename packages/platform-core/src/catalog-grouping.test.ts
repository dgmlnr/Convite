import { describe, expect, it } from "vitest";
import type { GameId, GameMetadata } from "@hexdev/platform-contract";
import { catalogGroupingOf } from "./catalog-grouping.js";

const metadata = (extra: Partial<GameMetadata> = {}): GameMetadata => ({ seatCount: 2, displayNameKey: "fixture.name", assetBase: "/fixture", ...extra });

/**
 * THE TWO GROUPING KEYS, NORMALIZED IN ONE PLACE.
 *
 * `gameFamily` and `section` are both optional on `GameMetadata` and both
 * required past the wire, so the absence has to be resolved somewhere. That
 * somewhere is this function and nowhere else: `buildCatalog` used to carry
 * its own `?? gameId` inline, and the composition-time straddle fence would
 * have needed a second copy of the same rule in a second package. Two copies
 * of one rule is a hardcoded fact about today that nothing re-checks.
 */
describe("catalogGroupingOf (spec: game-catalog-sections — Domain A)", () => {
  it("keeps a declared section, which is the whole point of declaring one", () => {
    expect(catalogGroupingOf("escoba-de-15" as GameId, metadata({ gameFamily: "escoba", section: "cartas" }))).toEqual({ gameFamily: "escoba", section: "cartas" });
  });

  /**
   * THE FAMILY, NOT THE ID — and the fixture has TWO entries on purpose.
   *
   * Writing `metadata.section ?? gameId` here would satisfy every
   * single-entry test in this file while quietly putting `truco-argentino`
   * and `truco-argentino-2v2` on two different shelves named after
   * themselves: one game, split in half, on a screen whose entire job is to
   * keep it whole. Only a family with more than one way of playing it can
   * tell the two implementations apart, so this assertion reads BOTH
   * entries and expects one section for the pair.
   */
  it("falls back to the NORMALIZED FAMILY, so two ways of playing one game share one section", () => {
    const sections = [catalogGroupingOf("truco-argentino" as GameId, metadata({ gameFamily: "truco" })), catalogGroupingOf("truco-argentino-2v2" as GameId, metadata({ gameFamily: "truco" }))].map(
      (grouping) => grouping.section,
    );

    expect(sections, "both ways of playing truco land on the same shelf").toEqual(["truco", "truco"]);
  });

  /**
   * THE CHAIN, ASSERTED AS A CHAIN. A module that declares neither key ends
   * up with both named after its id — but it gets there in two steps, id →
   * family → section, and the intermediate step is load-bearing. Asserting
   * only `section === "solo"` would pass just as happily against a
   * `?? gameId` shortcut that never looks at the family at all, so the
   * expectation names both fields at once.
   */
  it("chains id → family → section when a module declares neither", () => {
    expect(catalogGroupingOf("solo" as GameId, metadata())).toEqual({ gameFamily: "solo", section: "solo" });
  });

  it("still reads the declared section when the family is the id itself", () => {
    expect(catalogGroupingOf("solo" as GameId, metadata({ section: "fichas" }))).toEqual({ gameFamily: "solo", section: "fichas" });
  });
});
