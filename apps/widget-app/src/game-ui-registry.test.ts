import { describe, expect, it } from "vitest";
import type { GameId } from "@hexdev/platform-contract";
import { TILE_ATTRIBUTION } from "@hexdev/mahjong-tile-ui";
import { GAME_UI_CREDITS, createGameUiRegistry, familyUiFor, matchRenderContextFor, sectionUiFor } from "./game-ui-registry.js";

describe("createGameUiRegistry (design §5: rendering is deliberately outside the platform contract)", () => {
  it("has an entry for truco-argentino", () => {
    const registry = createGameUiRegistry();

    expect(registry.get("truco-argentino" as GameId)).not.toBeUndefined();
  });

  it("has a DISTINCT entry for truco-argentino-2v2 — the same table renderer package, but a game-ui-registry entry of its own", () => {
    const registry = createGameUiRegistry();

    expect(registry.get("truco-argentino-2v2" as GameId)).not.toBeUndefined();
  });

  it("returns undefined for a game with no registered table UI — the composition root falls back honestly, never throws", () => {
    const registry = createGameUiRegistry();

    expect(registry.get("some-other-game" as GameId)).toBeUndefined();
  });
});

describe("the registry keys identity by FAMILY, not by the id you join with", () => {
  it("both truco entries resolve to the one truco family, so their art can never diverge", () => {
    const registry = createGameUiRegistry();
    const a = registry.family("truco-argentino" as GameId);
    const b = registry.family("truco-argentino-2v2" as GameId);

    expect(a, "the same record, not two equal ones — there is nowhere left to copy-paste art into").toBe(b);
    expect(a?.id).toBe("truco");
  });
});

/** Unit M — lobby second family, completed (spec: `lobby-second-family`).
 * `familyUiFor`, not `createGameUiRegistry`: no lobby screen reads the match
 * registry, which is why these assertions target identity data rather than
 * the `GameUiEntry` records Unit O later added next to `trucoEntry` (see
 * `game-ui-registry.browser.test.ts`'s own escoba wiring tests for those). */
describe("familyUiFor(\"escoba\") — the lobby's finished second family", () => {
  it("declares the family name \"Escoba de 15\" as its heroTitle", () => {
    expect(familyUiFor("escoba")?.heroTitle).toBe("Escoba de 15");
  });

  /* Spec requirement "Escoba's hero art matches its lobby card art": screen
   * one's card and screen two's hero MUST show the identical three cards, no
   * separate art set. Proven here at the data level; game-list.browser.test.ts
   * proves the same fact rendered into both screens' actual DOM. */
  it("screen one's cardArt is the SAME three cards as screen two's hero — no separate art set", () => {
    const family = familyUiFor("escoba");

    expect(family?.cardArt, "reuses the identical array hero already declares").toEqual(family?.hero);
  });

  it("the 7 de oro sits at the centre — the position nothing overlaps (escoba/cartas-insignia-del-lobby)", () => {
    const family = familyUiFor("escoba");

    expect(family?.hero?.[1]).toContain("7-oro");
  });
});

/**
 * The shelf's own name. Client-owned for the same reason a family's is: the
 * server declares WHICH shelf (`GameMetadata.section`), the widget decides
 * what it is called, and no `displayNameKey` for sections crosses the wire.
 *
 * This is the fourth hand-written list in this file, so its failure mode is
 * load-bearing rather than incidental — see the second test.
 */
describe("sectionUiFor — what the catalog's shelves are called, on the client's side of the wire", () => {
  it("names the one shelf the four registered modules actually declare", () => {
    expect(sectionUiFor("cartas")?.id).toBe("cartas");
    expect(sectionUiFor("cartas")?.title, "the Spanish string itself lives in i18n.ts; this record only points at it").toBe("Cartas");
  });

  /* REPLACED, NOT DELETED (slice 9, spec Domain F: "the deliberate red is
   * replaced, not deleted"). This assertion used to read
   * `expect(sectionUiFor("fichas")).toBeUndefined()`, and it was correct for
   * as long as no module declared that shelf: a `SECTIONS` row nothing points
   * at is an enumerating-config entry with no referent. The solitaire
   * declares `section: "fichas"`, so the row has its referent and the shelf
   * has its name. */
  it("names the shelf the solitaire declares", () => {
    expect(sectionUiFor("fichas")?.id).toBe("fichas");
    expect(sectionUiFor("fichas")?.title, "the Spanish string itself lives in i18n.ts; this record only points at it").toBe("Fichas");
  });

  /* The missing-copy path is still real and still exercised — that is the
   * half of the old assertion that had to survive its replacement. It is
   * `undefined` for a shelf this build has no copy for, so `game-list.ts`
   * falls back to the raw section id and shows a visible bug report, rather
   * than a record with an empty title or a silent merge under the shelf
   * above. Asserted on an id no module declares, which is what the old
   * `"fichas"` assertion was until this slice. */
  it("returns undefined for a shelf this build has no copy for, rather than an empty name", () => {
    expect(sectionUiFor("dados")).toBeUndefined();
  });

  /* Two shelves now, and they are two different records with two different
   * names — a `sectionUiFor` that ignored its argument and answered
   * "Cartas" for everything would pass each lookup above on its own. */
  it("the two shelves are told apart", () => {
    const cartas = sectionUiFor("cartas");
    const fichas = sectionUiFor("fichas");

    // Anti-vacuity, and it is not decoration: measured (M9f) that dropping
    // `FICHAS_SECTION` from `SECTIONS` leaves this comparison GREEN, because
    // `undefined` differs from "Cartas" as happily as "Fichas" does. A fence
    // about two things being different has to say that both exist.
    expect(cartas?.title, "fence setup: the card shelf must have a name").toBeDefined();
    expect(fichas?.title, "fence setup: the tile shelf must have a name").toBeDefined();
    expect(cartas?.title).not.toBe(fichas?.title);
  });
});

/**
 * THE THIRD FAMILY, and the first that is not a deck of Spanish cards.
 *
 * `familyUiFor` rather than `createGameUiRegistry`, for the reason escoba's
 * own block above records: no lobby screen reads the match registry. What a
 * player sees on screen one and screen two comes from here.
 */
describe("familyUiFor(\"mahjong-solitario\") — the shelf's only game", () => {
  it("declares the game's own name as its heroTitle, so screen two says which game before it says which format", () => {
    expect(familyUiFor("mahjong-solitario")?.heroTitle).toBe("Mahjong Solitario");
  });

  /**
   * STILL NO `hero` — screen two's own header fan is a format-picker's row
   * (`game-screen.ts`), and a one-modality solitaire has no format to fan.
   * That absence is untouched by `cardArt` gaining real art below.
   */
  it("declares no hero fan — a one-modality game has no format to fan on its own screen", () => {
    const family = familyUiFor("mahjong-solitario");

    expect(family, "fence setup: the family must exist for its fields to mean anything").toBeDefined();
    expect(family?.hero).toBeUndefined();
  });

  /**
   * `cardArt` IS DECLARED NOW, and used to not be — see `MAHJONG_FAMILY`'s own
   * docblock in `game-ui-registry.ts` for why the earlier "declare nothing"
   * answer measured false on a real render. The 42 faces really are
   * TRANSPARENT artwork (`mahjong-tile-ui/about.ts`'s license record: nothing
   * was repaired, the transparency is deliberate) — what changed is not that
   * fact but the CONTRACT: `cardArt` now accepts a markup factory alongside a
   * URL, so a game whose faces need composition rather than a plain `<img>`
   * can still declare real art instead of none.
   *
   * Not a string, on purpose: the whole point of the widened contract is that
   * this field is NOT a URL a plain `<img>` could point at.
   */
  it("declares real cardArt now — markup factories, not URLs, one per tile", () => {
    const family = familyUiFor("mahjong-solitario");

    expect(family?.cardArt?.length, "the same three-face count truco's and escoba's own fans use").toBe(3);
    for (const item of family?.cardArt ?? []) {
      expect(typeof item, "a factory to call, never a string to point an <img> at").not.toBe("string");
      expect(typeof (item as { render?: unknown }).render).toBe("function");
    }
  });
});

/**
 * THE SECOND LICENSED ARTWORK IN THIS WIDGET, and it is not the same terms
 * as the first (task 9.10).
 *
 * `GAME_UI_CREDITS` dedupes on `author|licenseUrl`. The cards are CC BY-SA
 * 3.0 by Basquetteur; the tiles are CC BY-SA 4.0 by 碧海风 — both halves of
 * the key differ, so both obligations survive the dedupe. That is the fact
 * this block holds: not that the tile credit exists in its own package, but
 * that it REACHES the one surface a player can open.
 */
describe("GAME_UI_CREDITS — every credit this widget owes, once each", () => {
  it("carries the tile artwork's credit, with its own author, license and source", () => {
    const tiles = GAME_UI_CREDITS.find((credit) => credit.author === TILE_ATTRIBUTION.author);

    expect(tiles, "the tile artwork is CC BY-SA and this widget draws it; a credit that reaches no screen is not given").toBeDefined();
    expect(tiles?.licenseName).toBe("CC BY-SA 4.0");
    expect(tiles?.licenseUrl).toContain("creativecommons.org");
    expect(tiles?.changes.length, "CC BY-SA requires INDICATING that changes were made").toBeGreaterThan(0);
  });

  it("keeps the deck's credit beside it — two artworks, two authors, two license versions, neither deduped away", () => {
    // Anti-vacuity (R6): the assertions below walk a collection, and a
    // one-entry collection would satisfy half of them by accident.
    expect(GAME_UI_CREDITS.length).toBe(2);
    expect(GAME_UI_CREDITS.map((credit) => credit.licenseName).sort()).toEqual(["CC BY-SA 3.0", "CC BY-SA 4.0"]);
    expect(new Set(GAME_UI_CREDITS.map((credit) => credit.author)).size).toBe(2);
  });
});

/**
 * WHERE THIS MATCH CAME FROM, carried to the one place that can use it.
 *
 * `createRenderer` is called exactly once per match, which is exactly where a
 * chronometer would be created — so it is the seam that has to know whether
 * this match was started in this page session or resumed from a persisted one
 * after a reload. `main.ts`'s own rule is that composition stays there and
 * decisions leave; this mapping is the decision, so it lives here with a test
 * beside it.
 */
describe("matchRenderContextFor — the provenance a renderer is built with", () => {
  it("a fresh join is not a resume", () => {
    expect(matchRenderContextFor("joined", () => 7).resumed).toBe(false);
  });

  it("a resume is", () => {
    expect(matchRenderContextFor("resumed", () => 7).resumed).toBe(true);
  });

  it("the two really do differ, so neither assertion above stands alone", () => {
    expect(matchRenderContextFor("joined", () => 7).resumed).not.toBe(matchRenderContextFor("resumed", () => 7).resumed);
  });

  it("carries the CLOCK, not a reading of it", () => {
    /**
     * The difference is the whole feature. Capturing `now()` as a number here
     * would freeze the clock at the instant the match was entered, and every
     * chronometer built from this context would then measure zero — a board
     * cleared in four and a half minutes would report 0:00, and every fence
     * downstream that injects a scripted clock would still pass, because the
     * scripted clock would have been read too.
     */
    let reads = 0;
    const now = (): number => {
      reads += 1;
      return 7;
    };
    const context = matchRenderContextFor("joined", now);
    expect(reads, "building a context reads no clock — the reading belongs to whoever starts measuring").toBe(0);
    expect(context.now, "the same function, not a wrapper around a captured number").toBe(now);
    expect(context.now()).toBe(7);
  });
});

/**
 * THE FOUR SHIPPED ENTRIES ARE NOT EDITED, and this is what says so.
 *
 * `GameUiEntry.createRenderer` now takes a `MatchRenderContext`, and truco's
 * and escoba's factories ignore it by NOT DECLARING it — TypeScript assigns a
 * zero-argument `() => Renderer` to a one-argument parameter, so a game that
 * has nothing to do with time pays nothing for one that does. The rejected
 * alternative was a sixth positional argument on `render(...)`, which every
 * game would have paid for on the hot path.
 */
describe("every registered entry accepts a render context and none of them has to want it", () => {
  it.each(["truco-argentino", "truco-argentino-2v2", "escoba-de-15", "escoba-de-15-2v2"])("%s builds a renderer from a context it never declared", (id) => {
    const entry = createGameUiRegistry().get(id as GameId);
    expect(entry, "R6: an absent entry would make the assertion below vacuous").not.toBeUndefined();
    expect(typeof entry!.createRenderer(matchRenderContextFor("resumed", () => 7))).toBe("function");
  });

  it("and a caller that supplies no context at all does not compile", () => {
    /**
     * THE COMPILE-TIME HALF, and it is here because the mutation that made
     * the parameter optional came back with ZERO REDS — a type weakening
     * changes no behaviour, so no behaviour test can see it (the same
     * "derived, not typed" gap the tile package and the board package each
     * measured).
     *
     * `@ts-expect-error` closes it from the other side: TypeScript fails the
     * build when the directive is UNUSED, so the day `context` becomes
     * optional this line stops being an error and `tsc -b` says so.
     */
    // @ts-expect-error the render context is REQUIRED, and this line is what says so
    expect(typeof createGameUiRegistry().get("truco-argentino" as GameId)!.createRenderer()).toBe("function");
  });
});
