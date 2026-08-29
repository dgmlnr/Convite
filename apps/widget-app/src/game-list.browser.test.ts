import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameId } from "@hexdev/platform-contract";
import { CHROME_STYLE_ID } from "./chrome-styles.js";
import { renderGameList } from "./game-list.js";
import { renderGameSelection } from "./game-screen.js";
import type { GameFamily } from "./game-families.js";
import type { CatalogEntry } from "./bootstrap-data.js";
import type { LobbyDisplayEntry } from "@hexdev/platform-core";

/** The picker is driven by what the LOBBY reports, not by `configOptions` —
 * two modalities on the wire are what makes a choice exist to preserve. */
const TWO_MODALITIES: readonly LobbyDisplayEntry[] = [
  { modality: { pointsToWin: 15 }, waitingCount: 0, promoteBotFallback: false },
  { modality: { pointsToWin: 30 }, waitingCount: 0, promoteBotFallback: false },
];
const PRESENCE = new Map<GameId, readonly LobbyDisplayEntry[]>([["truco-argentino" as GameId, TWO_MODALITIES]]);

const entry = (id: string, gameFamily: string, seatCount = 2): CatalogEntry => ({
  id: id as GameId,
  gameFamily,
  displayNameKey: "games.truco.name",
  seatCount,
  configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
});
const TRUCO: GameFamily = { id: "truco", entries: [entry("truco-argentino", "truco"), entry("truco-argentino-2v2", "truco", 4)] };
const ESCOBA: GameFamily = { id: "escoba", entries: [entry("escoba-de-15", "escoba")] };

/* A fixture family id that is NOT `ESCOBA_FAMILY`'s real "escoba" — needed
 * because Unit M gave the real family a `cardArt` (spec: "Escoba's hero art
 * matches its lobby card art"), so `ESCOBA` above now resolves real art via
 * `familyUiFor` regardless of what this fixture's own fields say. The
 * "no declared art" case below needs a family id `familyUiFor` truly has
 * nothing for. */
const noArtEntry = (id: string): CatalogEntry => ({ id: id as GameId, gameFamily: "no-art-fixture", displayNameKey: "games.truco.name", seatCount: 2, configOptions: [] });
const NO_ART_FAMILY: GameFamily = { id: "no-art-fixture", entries: [noArtEntry("no-art-fixture-game")] };

/* Unit M's finished escoba entries — REAL ids, REAL empty `configOptions`,
 * exactly as `apps/server`'s registration (Slice L) and `escoba-module`
 * (Slice J) declare them. */
const escobaEntry = (id: string, displayNameKey: string, seatCount: number): CatalogEntry => ({
  id: id as GameId,
  gameFamily: "escoba",
  displayNameKey,
  seatCount,
  configOptions: [],
});
const ESCOBA_ENTRIES: readonly CatalogEntry[] = [escobaEntry("escoba-de-15", "games.escoba.name", 2), escobaEntry("escoba-de-15-2v2", "games.escoba2v2.name", 4)];
// `deriveModalities([])` yields exactly one modality, `{}` — the platform
// fact `MODALITY_SUMMARY`'s whole existence rests on (design D7/M3).
const ESCOBA_PRESENCE = new Map<GameId, readonly LobbyDisplayEntry[]>([
  ["escoba-de-15" as GameId, [{ modality: {}, waitingCount: 0, promoteBotFallback: false }]],
  ["escoba-de-15-2v2" as GameId, [{ modality: {}, waitingCount: 0, promoteBotFallback: false }]],
]);

let container: HTMLElement;
afterEach(() => {
  container.remove();
  document.getElementById(CHROME_STYLE_ID)?.remove();
});
function fresh(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}
const noop = (): void => {};

describe("renderGameList — screen one", () => {
  it("renders one card per game, never one per way of joining it", () => {
    const el = fresh();
    renderGameList(el, [TRUCO, ESCOBA], { onOpenGame: noop });

    const cards = el.querySelectorAll(".hexdev-game-card");
    expect(cards, "truco's two entries are one game to choose").toHaveLength(2);
    expect([...cards].map((c) => (c as HTMLElement).dataset.family)).toEqual(["truco", "escoba"]);
  });

  /* THE WHOLE CARD IS THE TARGET, and it is a real button. A div with a click
   * handler looks identical and cannot be reached by keyboard, has no role,
   * and takes no focus — the failure nobody sees because it only affects the
   * people who cannot see it either. */
  it("each card is a button, so a keyboard reaches it without being told to", () => {
    const el = fresh();
    renderGameList(el, [TRUCO], { onOpenGame: noop });

    const card = el.querySelector<HTMLElement>(".hexdev-game-card")!;
    expect(card.tagName).toBe("BUTTON");
    expect(card.getAttribute("type"), "never a submit inside a host page's form").toBe("button");
  });

  it("pressing a card opens that game and no other", () => {
    const el = fresh();
    const opened: string[] = [];
    renderGameList(el, [TRUCO, ESCOBA], { onOpenGame: (family) => opened.push(family.id) });

    el.querySelector<HTMLElement>('[data-family="escoba"]')!.click();
    expect(opened).toEqual(["escoba"]);
  });

  it("an empty catalog says so, rather than rendering a blank screen", () => {
    const el = fresh();
    renderGameList(el, [], { onOpenGame: noop });
    expect(el.textContent).toContain("Este sitio todavía no tiene juegos habilitados.");
  });

  /* THE LICENSING ONE, and it is the reason this test exists rather than a
   * nicety. The deck's attribution used to live on the one screen everybody
   * reached. A multi-family tenant now sits HERE instead, and an obligation
   * owed on a screen nobody visits is not discharged. Nothing errors if this
   * regresses — it is simply gone. */
  it("carries the deck's credits, because this is now a screen a player can sit on", () => {
    const el = fresh();
    renderGameList(el, [TRUCO, ESCOBA], { onOpenGame: noop });
    expect(el.querySelector(".hexdev-about"), "the same disclosure screen two renders").not.toBeNull();
  });

  /**
   * THE LICENSING ONE FOR ESCOBA, screen one's own half. `GAME_UI_CREDITS`
   * is unioned across the module's whole `FAMILIES` list (`game-ui-
   * registry.ts`), never scoped to what a caller passes in — so the test
   * above alone would keep passing even if a future refactor made the
   * credit panel conditional on WHICH family is on screen and simply forgot
   * escoba. Rendering with escoba as the ONLY family on screen is the fence
   * against exactly that: the panel, and Basquetteur's name in it, must
   * still reach a player here even when truco is nowhere in the list.
   */
  it("carries the deck's credits when escoba is the ONLY family on screen", () => {
    const el = fresh();
    renderGameList(el, [ESCOBA], { onOpenGame: noop });
    expect(el.querySelector(".hexdev-about-panel")?.textContent ?? "").toContain("Basquetteur");
  });
});

describe("the back control — absent, never disabled", () => {
  it("screen two renders no back control when the caller passes no onBack", () => {
    const el = fresh();
    renderGameSelection(el, TRUCO.entries, TRUCO.id, new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.querySelector(".hexdev-chrome-back"), "a tenant with one game never saw a list to return to").toBeNull();
  });

  it("renders it, and returns, when there is somewhere to go back to", () => {
    const el = fresh();
    const onBack = vi.fn();
    renderGameSelection(el, TRUCO.entries, TRUCO.id, new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop, onBack });

    const back = el.querySelector<HTMLElement>(".hexdev-chrome-back")!;
    expect(back.tagName).toBe("BUTTON");
    back.click();
    expect(onBack).toHaveBeenCalledOnce();
  });

  /* THE CONTAINER IS THE SAME ELEMENT ACROSS BOTH SCREENS, and that is the
   * silent one. `game-screen.ts` keys the player's picked modality by
   * CONTAINER (a module-level WeakMap), so handing screen two a different
   * element would reset that pick on every trip through the list — with no
   * error, no failing test, and no way to notice except by playing. */
  it("the picked modality survives a trip out to the list and back into the game", () => {
    const el = fresh();
    renderGameSelection(el, TRUCO.entries, TRUCO.id, PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });

    const pressed = (): string | undefined => el.querySelector<HTMLElement>(".hexdev-modality-option[aria-pressed='true']")?.textContent ?? undefined;

    // PICK SOMETHING OTHER THAN THE DEFAULT, and prove it took. An earlier
    // version of this clicked whichever option happened to be last, which was
    // already the selected one — so it preserved nothing across the round
    // trip and a mutation that threw the selection away still passed it.
    const before = pressed();
    const other = [...el.querySelectorAll<HTMLElement>(".hexdev-modality-option")].find((option) => option.textContent !== before);
    expect(other, "the fixture must offer a second modality, or this proves nothing").toBeDefined();
    other!.click();

    const picked = pressed();
    expect(picked, "the click has to have moved the selection before there is anything to preserve").not.toBe(before);

    renderGameList(el, [TRUCO, ESCOBA], { onOpenGame: noop });
    renderGameSelection(el, TRUCO.entries, TRUCO.id, PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.querySelector<HTMLElement>(".hexdev-modality-option[aria-pressed='true']")?.textContent, "same container, so the pick is still there").toBe(picked);
  });
});

/* THE ART AND THE MARK — what makes this a screen rather than a list. */
describe("each game shows its own cards, and the place names itself quietly", () => {
  it("a family with declared art fans it above the name, hidden from a screen reader", () => {
    const el = fresh();
    renderGameList(el, [TRUCO], { onOpenGame: noop });

    const fan = el.querySelector<HTMLElement>(".hexdev-game-card-art")!;
    expect(fan.querySelectorAll("img").length, "truco declares three").toBe(3);
    expect(fan.getAttribute("aria-hidden"), "the heading below already names the game — three alt texts would be read out first and name nothing").toBe("true");
  });

  /* NOT `hero.slice(0, 3)`, which is the shortcut this guards against.
   * `hero-cards.ts` says ORDER IS THE LAYOUT with the best card at the fan's
   * centre; slicing the first three would put the as de espada at the right
   * EDGE, half hidden, and a three of cups in the middle. */
  it("the fan's own centre is the card the game is known by", () => {
    const el = fresh();
    renderGameList(el, [TRUCO], { onOpenGame: noop });

    const faces = [...el.querySelectorAll<HTMLImageElement>(".hexdev-game-card-face")];
    expect(faces[1]?.src, "the middle slot is the one nothing overlaps").toContain("1-espada");
  });

  /* A GAME WITH NO ART IS STILL A GAME. A family can land in the catalog
   * before its faces are chosen, and the list must not grow a hole while that
   * is true — the card stays a card, and stays pressable. (Escoba itself no
   * longer exercises this path — Unit M gave it real `cardArt` — so this uses
   * a dedicated fixture family instead.) */
  it("a family with no declared art renders a full card with no empty gap", () => {
    const el = fresh();
    const opened: string[] = [];
    renderGameList(el, [NO_ART_FAMILY], { onOpenGame: (family) => opened.push(family.id) });

    const card = el.querySelector<HTMLElement>('[data-family="no-art-fixture"]')!;
    expect(el.querySelector(".hexdev-game-card-art"), "no empty art box left behind").toBeNull();
    expect(card.textContent?.trim().length, "still named").toBeGreaterThan(0);
    card.click();
    expect(opened, "and still a full activation target").toEqual(["no-art-fixture"]);
  });

  /* Unit M / spec "Escoba's hero art matches its lobby card art": screen
   * one's own card now shows the real three cards, same as the truco
   * assertions above — the same fan mechanism, a different family's faces. */
  it("escoba's own card fan shows its three badge cards, 7 de oro at the centre — same as its screen-two hero", () => {
    const el = fresh();
    renderGameList(el, [ESCOBA], { onOpenGame: noop });

    const faces = [...el.querySelectorAll<HTMLImageElement>(".hexdev-game-card-face")];
    expect(faces.length).toBe(3);
    expect(faces[1]?.src, "the middle slot is the one nothing overlaps").toContain("7-oro");
  });

  it("the mark sits at the foot beside the credits, never over the games", () => {
    const el = fresh();
    renderGameList(el, [TRUCO, ESCOBA], { onOpenGame: noop });

    const foot = el.querySelector<HTMLElement>(".hexdev-chrome-foot")!;
    expect(foot.querySelector(".hexdev-chrome-brand")?.textContent).toBe("Convite");
    expect(foot.querySelector(".hexdev-about"), "the credits live in the same foot").not.toBeNull();
    expect(el.querySelector(".hexdev-chrome-header")?.textContent, "and the header says nothing about the place").not.toContain("Convite");
  });
});

/* Unit M — lobby second family, completed (spec: `lobby-second-family`,
 * design D6/D7). Both escoba `GameId`s, through `renderGameSelection`
 * (screen two), with their REAL empty `configOptions`. */
describe("escoba's finished game cards (Unit M)", () => {
  it("titles the 2-seat and 4-seat cards with the existing seat-count formatting — no escoba-specific title strings", () => {
    const el = fresh();
    renderGameSelection(el, ESCOBA_ENTRIES, "escoba", ESCOBA_PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });

    const titles = [...el.querySelectorAll<HTMLElement>(".hexdev-game-card h2")].map((h2) => h2.textContent);
    expect(titles).toEqual(["Mano a mano", "En parejas"]);
  });

  /* The platform defect Slice B fixed (empty `<h3>`, dangling aria-label
   * comma) is verifiable on ANY empty-`configOptions` fixture; THIS is the
   * proof escoba itself never reaches that defect once MODALITY_SUMMARY (M3)
   * exists — see i18n.test.ts for the platform-general mechanism directly. */
  it("renders no empty modality heading and reads \"Partida a 30\" for both entries", () => {
    const el = fresh();
    renderGameSelection(el, ESCOBA_ENTRIES, "escoba", ESCOBA_PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });

    const headings = el.querySelectorAll(".hexdev-modality-title");
    expect(headings, "one per card, never an empty heading").toHaveLength(2);
    for (const heading of headings) expect(heading.textContent).toBe("Partida a 30");
  });

  it("the modality group's aria-label carries the summary with no dangling separator", () => {
    const el = fresh();
    renderGameSelection(el, ESCOBA_ENTRIES, "escoba", ESCOBA_PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });

    const groups = el.querySelectorAll<HTMLElement>(".hexdev-modality[role=\"group\"]");
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.getAttribute("aria-label")).toBe("Escoba de 15, Partida a 30");
    }
  });
});
