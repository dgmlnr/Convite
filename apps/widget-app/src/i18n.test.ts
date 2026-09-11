import { describe, expect, it } from "vitest";
import { STRINGS, translateConfigLabel, translateGameName } from "./i18n.js";

describe("i18n (Spanish user-facing copy — the player is Argentine, the game is Truco)", () => {
  it("translates a known display-name key to its Spanish label", () => {
    expect(translateGameName("games.truco.name")).toBe("Truco Argentino");
  });

  it("falls back to the raw key for an unknown display-name key, rather than showing nothing", () => {
    expect(translateGameName("games.unknown-game.name")).toBe("games.unknown-game.name");
  });

  it("translates the 2v2 truco display-name key distinctly from the 1v1 one", () => {
    expect(translateGameName("games.truco2v2.name")).toBe("Truco Argentino 2v2");
    expect(translateGameName("games.truco2v2.name")).not.toBe(translateGameName("games.truco.name"));
  });

  /**
   * Slice L.5. Unlike truco's pair above, escoba's two keys translate to the
   * SAME string — the family name, not a per-entry title (i18n.ts's own
   * comment on `GAME_NAME_LABELS`: the two formats are distinguished by
   * `STRINGS.formatName(seatCount)` instead, not by a second name string).
   */
  it("translates both escoba display-name keys to the family name, 'Escoba de 15'", () => {
    expect(translateGameName("games.escoba.name")).toBe("Escoba de 15");
    expect(translateGameName("games.escoba2v2.name")).toBe("Escoba de 15");
  });

  it("translates a known config-option label key", () => {
    expect(translateConfigLabel("games.truco.pointsToWin")).toBe("Puntos");
  });

  it("waitingCount pluralizes correctly for one vs many waiting players", () => {
    expect(STRINGS.waitingCount(1)).toBe("1 jugador esperando");
    expect(STRINGS.waitingCount(3)).toBe("3 jugadores esperando");
  });

  it("offers plain, warm, jargon-free copy for a failed join, plus a retry label (bug: today the UI does nothing at all when a join is rejected)", () => {
    expect(STRINGS.joinFailed).toBe("No pudimos conectarte a la partida. Probá de nuevo.");
    expect(STRINGS.retry).toBe("Reintentar");
  });

  /**
   * Unit M / design D7. Art. 8.1 (Reglamento Oficial, Juegos Bonaerenses
   * 2026) fixes the match at 30 points — corrected from an earlier, wrong
   * "21" — for BOTH escoba entries, mano a mano and en parejas alike.
   */
  it("modalitySummary resolves both escoba ids to \"Partida a 30\"", () => {
    expect(STRINGS.modalitySummary("escoba-de-15")).toBe("Partida a 30");
    expect(STRINGS.modalitySummary("escoba-de-15-2v2")).toBe("Partida a 30");
  });

  it("modalitySummary is undefined for a game that declared none — no placeholder string", () => {
    expect(STRINGS.modalitySummary("truco-argentino")).toBeUndefined();
  });

  /**
   * SLICE 9 — THE THREE LINES A ONE-SEAT CARD IS MADE OF, and the reason
   * they are one describe block rather than three scattered assertions is
   * that they fail together in exactly one way: `formatName`,
   * `formatDescription` and `modalitySummary` are each written as
   * `seatCount === 2 ? … : === 4 ? … : undefined`-shaped lookups, so a game
   * nobody wrote a branch for renders, and says nothing. Not blank — ABSENT:
   * `game-screen.ts` omits the heading, omits the blurb, and falls the card
   * title back to the game's own name. A card that renders and is empty is
   * the failure mode this block exists to make impossible.
   *
   * The copy is written out BY HAND here rather than read off the production
   * table (R15): asserting `formatName(1)` against whatever `formatName(1)`
   * returns would agree with any rewording, including an empty string.
   */
  describe("the one-seat game (slice 9)", () => {
    it("names the game itself", () => {
      expect(translateGameName("games.mahjongSolitario.name")).toBe("Mahjong Solitario");
    });

    it("names the FORMAT one seat is, in the same vocabulary the other two seat counts use", () => {
      expect(STRINGS.formatName(1)).toBe("Solitario");
      // The three are genuinely three different words. A `formatName` that
      // answered one string for every seat count would satisfy each
      // assertion above on its own.
      expect(new Set([STRINGS.formatName(1), STRINGS.formatName(2), STRINGS.formatName(4)]).size).toBe(3);
    });

    it("says what that format IS, in one line, parallel to the two-seat one", () => {
      expect(STRINGS.formatDescription(1)).toBe("Vos contra el tablero.");
      expect(STRINGS.formatDescription(2)).toBe("Vos contra un rival.");
    });

    it("gives the empty-configOptions summary a true, useful line rather than nothing", () => {
      expect(STRINGS.modalitySummary("mahjong-solitario")).toBe("Tablero de 144 fichas");
    });

    it("labels the single play control without naming an opponent", () => {
      expect(STRINGS.playSolo).toBe("Jugar");
      // The whole point: it is not the two-seat label with words removed,
      // and it does not mention a person or a machine.
      expect(STRINGS.playSolo).not.toContain("contra");
    });

    it("still answers nothing for a seat count nobody has written a line for", () => {
      expect(STRINGS.formatName(3)).toBeUndefined();
      expect(STRINGS.formatDescription(3)).toBeUndefined();
    });
  });

  /**
   * SLICE 19 — THE DICE GAME'S OWN COPY.
   *
   * Its name is a proper noun and survives untranslated, so unlike the shelf
   * it sits on there is nothing here to decide except that the key resolves
   * at all: without this row the front door prints the raw key
   * `games.generala.name` over a card a tenant is entitled to, which is the
   * visible-bug-report failure `translateGameName` chose on purpose.
   *
   * The copy is written out BY HAND rather than read off the production
   * table, the same rule the block above states: asserting the lookup
   * against whatever the lookup returns would agree with any rewording,
   * including an empty string.
   */
  describe("the dice game (slice 19)", () => {
    it("names the game itself", () => {
      expect(translateGameName("games.generala.name")).toBe("Generala");
    });

    /* Anti-vacuity, and it is the same shape the escoba pair above needs: a
     * `GAME_NAME_LABELS` that answered one string for every key would satisfy
     * the assertion above on its own. Compared against a name from a
     * DIFFERENT family, so the two cannot be one entry read twice. */
    it("is a name of its own, not the shelf's or a neighbour's", () => {
      expect(translateGameName("games.generala.name")).not.toBe(translateGameName("games.mahjongSolitario.name"));
      expect(translateGameName("games.generala.name")).not.toBe(STRINGS.sectionDados);
    });

    /* `configOptions` is empty and permanently so (spec Domain D), so
     * `describeModality` has nothing to compute and screen two would render
     * NO heading at all — the exact gap the solitaire's own line closed one
     * slice's worth of copy ago. Eleven is the number of boxes on the card
     * (`CATEGORY_IDS`), which is what a player is actually sitting down to
     * fill. */
    it("gives the empty-configOptions summary a true, useful line rather than nothing", () => {
      expect(STRINGS.modalitySummary("generala")).toBe("Planilla de 11 categorías");
    });

    /* The shelf, not the game: an ordinary common noun a second language
     * would translate, which is the rule that put "Cartas" and "Fichas" in
     * this table and left "Escoba de 15" out of it. */
    it("names the shelf the dice sit on", () => {
      expect(STRINGS.sectionDados).toBe("Dados");
    });
  });

  /**
   * SDD `mentiroso`, task 6.1 — the copy the composition root needs to seat
   * a player at a real table.
   *
   * Mentiroso registers THREE ids at THREE seat counts (2/4/6), never two —
   * so unlike escoba's shared family name, each seat count needs its OWN
   * distinguishing label. The DEFAULT modality (2 seats) carries the plain
   * family name; the wider tables say how many sit at them, the same
   * "default carries no qualifier, the rest do" convention truco's own pair
   * ("Truco Argentino" / "Truco Argentino 2v2") already establishes.
   */
  describe("the bluffing dice game (task 6.1)", () => {
    it("names the game itself at 2 seats, with no qualifier — the default modality", () => {
      expect(translateGameName("games.mentiroso2.name")).toBe("Mentiroso");
    });

    it("names the wider tables distinctly, each carrying its own seat count", () => {
      expect(translateGameName("games.mentiroso4.name")).toBe("Mentiroso (4 jugadores)");
      expect(translateGameName("games.mentiroso6.name")).toBe("Mentiroso (6 jugadores)");
      // Three genuinely different strings, not one repeated three times.
      expect(new Set([translateGameName("games.mentiroso2.name"), translateGameName("games.mentiroso4.name"), translateGameName("games.mentiroso6.name")]).size).toBe(3);
    });

    it("gives the empty-configOptions summary the game's own distinctive rule, for all three seat counts", () => {
      expect(STRINGS.modalitySummary("mentiroso-2")).toBe("El techo obliga a dudar.");
      expect(STRINGS.modalitySummary("mentiroso-4")).toBe("El techo obliga a dudar.");
      expect(STRINGS.modalitySummary("mentiroso-6")).toBe("El techo obliga a dudar.");
    });

    /**
     * THE REGRESSION THIS FAMILY WOULD OTHERWISE HIT. `formatName`/
     * `formatDescription` are generic, seat-count-only lookups — every
     * 4-seat game shipped before this one really was two teams of two, so
     * `formatName(4)` reads "En parejas" ("in pairs") and
     * `formatDescription(4)` reads "En parejas: vos y un compañero contra
     * dos." ("teamed up: you and a partner against two"). Mentiroso's own
     * 4-seat table is four individual rivals with no partner at all — that
     * generic answer would be a wrong claim about the game, not merely an
     * imprecise one. The optional `gameFamily` parameter lets exactly this
     * one family opt out, without changing what any other family reads.
     */
    it("opts OUT of the generic seat-count guess at every seat count mentiroso registers, unlike every family that came before it", () => {
      expect(STRINGS.formatName(2, "mentiroso")).toBeUndefined();
      expect(STRINGS.formatName(4, "mentiroso")).toBeUndefined();
      expect(STRINGS.formatName(6, "mentiroso")).toBeUndefined();
      expect(STRINGS.formatDescription(2, "mentiroso")).toBeUndefined();
      expect(STRINGS.formatDescription(4, "mentiroso")).toBeUndefined();
      expect(STRINGS.formatDescription(6, "mentiroso")).toBeUndefined();
    });

    it("and the generic guess is still exactly what it was for every OTHER family — the override is scoped, not a global change", () => {
      expect(STRINGS.formatName(2)).toBe("Mano a mano");
      expect(STRINGS.formatName(4)).toBe("En parejas");
      expect(STRINGS.formatDescription(4)).toBe("En parejas: vos y un compañero contra dos.");
    });
  });
});
