import { describe, expect, it } from "vitest";
import { STRINGS, translateConfigLabel, translateGameName } from "./i18n.js";

describe("i18n (Spanish user-facing copy — the player is Argentine, the game is Truco)", () => {
  it("translates a known display-name key to its Spanish label", () => {
    expect(translateGameName("games.truco.name")).toBe("Truco Argentino");
  });

  it("falls back to the raw key for an unknown display-name key, rather than showing nothing", () => {
    expect(translateGameName("games.escoba.name")).toBe("games.escoba.name");
  });

  it("translates a known config-option label key", () => {
    expect(translateConfigLabel("games.truco.pointsToWin")).toBe("Puntos para ganar");
  });

  it("waitingCount pluralizes correctly for one vs many waiting players", () => {
    expect(STRINGS.waitingCount(1)).toBe("1 jugador esperando");
    expect(STRINGS.waitingCount(3)).toBe("3 jugadores esperando");
  });

  it("offers plain, warm, jargon-free copy for a failed join, plus a retry label (bug: today the UI does nothing at all when a join is rejected)", () => {
    expect(STRINGS.joinFailed).toBe("No pudimos conectarte a la partida. Probá de nuevo.");
    expect(STRINGS.retry).toBe("Reintentar");
  });
});
