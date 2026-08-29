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
});
