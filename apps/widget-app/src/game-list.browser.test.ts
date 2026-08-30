import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameId } from "@hexdev/platform-contract";
import { CHROME_STYLE_ID } from "./chrome-styles.js";
import { renderGameList } from "./game-list.js";
import { renderGameSelection } from "./game-screen.js";
import type { GameFamily } from "./game-families.js";
import type { GameSection } from "./game-sections.js";
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
  section: "cartas",
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
const noArtEntry = (id: string): CatalogEntry => ({ id: id as GameId, gameFamily: "no-art-fixture", section: "cartas", displayNameKey: "games.truco.name", seatCount: 2, configOptions: [] });
const NO_ART_FAMILY: GameFamily = { id: "no-art-fixture", entries: [noArtEntry("no-art-fixture-game")] };

/* Unit M's finished escoba entries — REAL ids, REAL empty `configOptions`,
 * exactly as `apps/server`'s registration (Slice L) and `escoba-module`
 * (Slice J) declare them. */
const escobaEntry = (id: string, displayNameKey: string, seatCount: number): CatalogEntry => ({
  id: id as GameId,
  gameFamily: "escoba",
  section: "cartas",
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

/**
 * TODAY'S SCREEN, WRITTEN IN THE NEW SIGNATURE.
 *
 * Every assertion in this file that predates sections is about a tenant with
 * ONE shelf — which is exactly what the four registered modules produce, all
 * four declaring `section: "cartas"`. Wrapping the same families in one
 * section keeps those fixtures saying what they always said, and keeps the
 * suppression branch (no wrapper, no heading, cards at `h2`) as the default
 * every one of them runs through.
 */
const oneSection = (families: readonly GameFamily[]): readonly GameSection[] => [{ id: "cartas", families }];

describe("renderGameList — screen one", () => {
  it("renders one card per game, never one per way of joining it", () => {
    const el = fresh();
    renderGameList(el, oneSection([TRUCO, ESCOBA]), { onOpenGame: noop });

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
    renderGameList(el, oneSection([TRUCO]), { onOpenGame: noop });

    const card = el.querySelector<HTMLElement>(".hexdev-game-card")!;
    expect(card.tagName).toBe("BUTTON");
    expect(card.getAttribute("type"), "never a submit inside a host page's form").toBe("button");
  });

  it("pressing a card opens that game and no other", () => {
    const el = fresh();
    const opened: string[] = [];
    renderGameList(el, oneSection([TRUCO, ESCOBA]), { onOpenGame: (family) => opened.push(family.id) });

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
    renderGameList(el, oneSection([TRUCO, ESCOBA]), { onOpenGame: noop });
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
    renderGameList(el, oneSection([ESCOBA]), { onOpenGame: noop });
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

    renderGameList(el, oneSection([TRUCO, ESCOBA]), { onOpenGame: noop });
    renderGameSelection(el, TRUCO.entries, TRUCO.id, PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.querySelector<HTMLElement>(".hexdev-modality-option[aria-pressed='true']")?.textContent, "same container, so the pick is still there").toBe(picked);
  });
});

/**
 * ONE STRING WAS SERVING TWO SCREENS, and nothing here could tell.
 *
 * Screen one offers a choice of GAMES; screen two offers a choice of ways to
 * play the one already chosen. Both headings read `STRINGS.selectionTitle`,
 * so the front door asked "Elegí cómo jugar" over a row of games it was not
 * yet offering any way to play. No assertion in this package distinguished
 * the two headings, which is exactly how they came to be the same string.
 *
 * Both screens render into the SAME element below, on purpose: that is what
 * the widget really does (the modality WeakMap is keyed by container), so
 * these are the two headings a player actually sees one after the other.
 */
describe("each screen asks its own question", () => {
  /* THE FALLBACK IS THE DANGEROUS CASE. A family that declares no
   * `heroTitle` makes screen two fall back to the instruction AS its
   * heading — slice A's own reasoning, and correct there — so this is
   * precisely where the two headings would collide again if screen one ever
   * borrowed screen two's string back. */
  it("screen one's heading is not the question screen two asks", () => {
    const el = fresh();
    renderGameList(el, oneSection([TRUCO, ESCOBA]), { onOpenGame: noop });
    const listHeading = el.querySelector(".hexdev-chrome-title")?.textContent;

    renderGameSelection(el, NO_ART_FAMILY.entries, NO_ART_FAMILY.id, new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop });
    const gameHeading = el.querySelector(".hexdev-chrome-title")?.textContent;

    expect(gameHeading, "screen two legitimately falls back to the instruction when a family declares no hero title").toBe("Elegí cómo jugar");
    expect(listHeading, "and screen one must not be asking screen two's question").not.toBe(gameHeading);
  });

  it("screen one asks WHICH game, where screen two asks HOW to play it", () => {
    const el = fresh();
    renderGameList(el, oneSection([TRUCO, ESCOBA]), { onOpenGame: noop });
    expect(el.querySelector(".hexdev-chrome-title")?.textContent).toBe("Elegí un juego");

    // A family that DOES declare a hero title: its name becomes screen two's
    // heading and the instruction moves to the line under it. Different
    // element, same question — and still not screen one's.
    renderGameSelection(el, TRUCO.entries, TRUCO.id, PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });
    expect(el.querySelector(".hexdev-chrome-title")?.textContent, "the game names itself once a game is chosen").toBe("Truco Argentino");
    expect(el.querySelector(".hexdev-chrome-instruction")?.textContent).toBe("Elegí cómo jugar");
  });
});

/* THE ART AND THE MARK — what makes this a screen rather than a list. */
describe("each game shows its own cards, and the place names itself quietly", () => {
  it("a family with declared art fans it above the name, hidden from a screen reader", () => {
    const el = fresh();
    renderGameList(el, oneSection([TRUCO]), { onOpenGame: noop });

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
    renderGameList(el, oneSection([TRUCO]), { onOpenGame: noop });

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
    renderGameList(el, oneSection([NO_ART_FAMILY]), { onOpenGame: (family) => opened.push(family.id) });

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
    renderGameList(el, oneSection([ESCOBA]), { onOpenGame: noop });

    const faces = [...el.querySelectorAll<HTMLImageElement>(".hexdev-game-card-face")];
    expect(faces.length).toBe(3);
    expect(faces[1]?.src, "the middle slot is the one nothing overlaps").toContain("7-oro");
  });

  it("the mark sits at the foot beside the credits, never over the games", () => {
    const el = fresh();
    renderGameList(el, oneSection([TRUCO, ESCOBA]), { onOpenGame: noop });

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

/* ART-FREE FIXTURES, and the art-free-ness is load-bearing rather than tidy.
 * A family with declared art serializes an `<img src>` Vite resolves to an
 * absolute URL carrying the dev server's own port, so a markup literal
 * captured on one run would not match the next. What the shelf tests are
 * about is STRUCTURE — wrapper, heading, heading level, band; the art path
 * already has the fan assertions above. */
const plainEntry = (id: string, gameFamily: string, section: string, displayNameKey: string): CatalogEntry => ({
  id: id as GameId,
  gameFamily,
  section,
  displayNameKey,
  seatCount: 2,
  configOptions: [],
});
const ALFA: GameFamily = { id: "alfa-fixture", entries: [plainEntry("alfa-fixture-game", "alfa-fixture", "cartas", "games.truco.name")] };
const BETA: GameFamily = { id: "beta-fixture", entries: [plainEntry("beta-fixture-game", "beta-fixture", "fichas-sin-copia", "games.escoba.name")] };

/** TWO SHELVES, and the second one is deliberately a section id `SECTIONS`
 * has no copy for. That is the fourth-hand-written-list failure mode
 * (`game-ui-registry.ts`'s own docblock) rendered rather than argued: it must
 * come out as its raw id, visible and ugly, never as no heading at all —
 * which would file these cards under the shelf above and mis-attribute them. */
const TWO_SHELVES: readonly GameSection[] = [
  { id: "cartas", families: [TRUCO, ALFA] },
  { id: "fichas-sin-copia", families: [BETA] },
];

/**
 * THE SCREEN AS IT WAS AT `8247981`, the commit before this slice.
 *
 * Captured by rendering `renderGameList` at that commit with the two art-free
 * families above — not hand-written, not reconstructed from reading the
 * renderer. Every configured tenant today is entitled to four ids that
 * collapse into ONE shelf, so this string is the render a player actually
 * gets, and "the one-section case is unchanged" is only worth saying if it
 * means the same bytes.
 */
const PRE_SECTION_MARKUP =
  '<div class="hexdev-chrome-content"><header class="hexdev-chrome-header"><h1 class="hexdev-chrome-title">Elegí un juego</h1><p class="hexdev-chrome-tagline">Sentate a jugar: sin instalar nada, sin crear cuenta.</p></header><div class="hexdev-chrome-games"><button type="button" class="hexdev-game-card hexdev-game-card--choice" data-family="alfa-fixture"><h2>Truco Argentino</h2></button><button type="button" class="hexdev-game-card hexdev-game-card--choice" data-family="beta-fixture"><h2>Escoba de 15</h2></button></div><footer class="hexdev-chrome-foot"><p class="hexdev-chrome-brand">Convite</p><details class="hexdev-about"><summary class="hexdev-about-toggle" aria-label="Créditos y licencia" title="Créditos y licencia">i</summary><div class="hexdev-about-panel"><h2 class="hexdev-about-title">Créditos</h2><p class="hexdev-about-credit">Arte de las cartas: Basquetteur. Se le hicieron cambios.</p><p class="hexdev-about-links"><a href="https://github.com/gjenkins20/spanish-playing-cards-svg" target="_blank" rel="noopener noreferrer">Ver la fuente</a><a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">Licencia CC BY-SA 3.0</a></p></div></details></footer></div>';

describe("one shelf: the screen a player gets today, and the same bytes as before", () => {
  it("adds no group wrapper and no shelf heading", () => {
    const el = fresh();
    renderGameList(el, oneSection([ALFA, BETA]), { onOpenGame: noop });

    expect(el.querySelector(".hexdev-chrome-section"), "a lone shelf grew a <section> wrapper nobody asked for").toBeNull();
    expect(el.querySelector(".hexdev-chrome-section-title"), 'a lone shelf grew a "Cartas" heading over its only group').toBeNull();
    expect(el.querySelector(".hexdev-chrome-content > .hexdev-chrome-games"), "the band stopped hanging directly off the content column").not.toBeNull();
  });

  it("leaves the card names at h2, the level they have had all along", () => {
    const el = fresh();
    renderGameList(el, oneSection([ALFA, BETA]), { onOpenGame: noop });

    expect(el.querySelectorAll(".hexdev-game-card h2"), "the names stopped being h2 on a screen with nothing above them").toHaveLength(2);
    expect(el.querySelectorAll(".hexdev-game-card h3"), "the level stepped with no shelf heading to step under").toHaveLength(0);
  });

  it("renders the exact markup it rendered before sections existed", () => {
    const el = fresh();
    renderGameList(el, oneSection([ALFA, BETA]), { onOpenGame: noop });

    expect(el.querySelector(".hexdev-chrome-content")!.outerHTML).toBe(PRE_SECTION_MARKUP);
  });
});

describe("two shelves: headed groups, in the catalog's own order", () => {
  it("wraps each shelf in its own <section> around its own untouched band", () => {
    const el = fresh();
    renderGameList(el, TWO_SHELVES, { onOpenGame: noop });

    const shelves = [...el.querySelectorAll<HTMLElement>(".hexdev-chrome-content > .hexdev-chrome-section")];
    expect(shelves, "one wrapper per shelf, and each a direct child of the content column").toHaveLength(2);
    expect(
      shelves.map((shelf) => shelf.querySelectorAll(":scope > .hexdev-chrome-games").length),
      "each shelf owns exactly one band, and the band is still its direct child",
    ).toEqual([1, 1]);
    expect(
      shelves.map((shelf) => [...shelf.querySelectorAll<HTMLElement>(".hexdev-game-card")].map((card) => card.dataset.family)),
      "each heading is followed by exactly its own shelf's games, in catalog order",
    ).toEqual([["truco", "alfa-fixture"], ["beta-fixture"]]);
  });

  it("names a known shelf from the client's own copy, and an unknown one by its raw id", () => {
    const el = fresh();
    renderGameList(el, TWO_SHELVES, { onOpenGame: noop });

    expect(
      [...el.querySelectorAll(".hexdev-chrome-section-title")].map((heading) => heading.textContent),
      "a shelf the client has no copy for must show its id, never an empty heading",
    ).toEqual(["Cartas", "fichas-sin-copia"]);
  });

  it("puts the shelf headings at h2 and steps the card names to h3, so the outline skips nothing", () => {
    const el = fresh();
    renderGameList(el, TWO_SHELVES, { onOpenGame: noop });

    expect(el.querySelectorAll(".hexdev-chrome-title"), "the screen's own h1 stays exactly one").toHaveLength(1);
    expect([...el.querySelectorAll(".hexdev-chrome-section-title")].map((heading) => heading.tagName)).toEqual(["H2", "H2"]);
    expect(
      [...el.querySelectorAll<HTMLElement>(".hexdev-game-card")].map((card) => card.querySelector("h2, h3")!.tagName),
      "a card name left at h2 sits at the same level as the shelf heading above it",
    ).toEqual(["H3", "H3", "H3"]);
  });

  it("names each group after its own heading, so it is exposed as a region at all", () => {
    const el = fresh();
    renderGameList(el, TWO_SHELVES, { onOpenGame: noop });

    for (const shelf of el.querySelectorAll<HTMLElement>(".hexdev-chrome-section")) {
      const labelledBy = shelf.getAttribute("aria-labelledby");
      expect(labelledBy, "an unnamed <section> is not exposed as a region at all").toBeTruthy();
      expect(document.getElementById(labelledBy!)?.textContent, "aria-labelledby points at something that is not this shelf's own heading").toBe(
        shelf.querySelector(".hexdev-chrome-section-title")!.textContent,
      );
    }
  });

  it("keeps every card a button that opens its own game", () => {
    const el = fresh();
    const opened: string[] = [];
    renderGameList(el, TWO_SHELVES, { onOpenGame: (family) => opened.push(family.id) });

    expect([...el.querySelectorAll(".hexdev-game-card")].map((card) => card.tagName)).toEqual(["BUTTON", "BUTTON", "BUTTON"]);
    el.querySelector<HTMLElement>('[data-family="beta-fixture"]')!.click();
    expect(opened, "a card under the second shelf still fires for its own family").toEqual(["beta-fixture"]);
  });
});

/**
 * THE BAND, MEASURED — because "a heading over some cards" is what BOTH
 * arrangements look like, and only one of them is right.
 *
 * At ≥720px `.hexdev-chrome-games` becomes `repeat(auto-fit, minmax(320px,
 * 22rem))` with `justify-content: center` (`chrome-styles.ts`). An `<h2>`
 * placed INSIDE it is therefore a grid ITEM in one 22rem track, sitting
 * beside a card rather than over the row, and pushed off the band's own left
 * edge by the centring. Keeping the heading a SIBLING of the band is what
 * makes the geometry below hold, and it is why `.hexdev-chrome-games` is
 * edited by zero lines in this slice.
 *
 * The failure is invisible below the tier, where the band is still a flex
 * column and a child `<h2>` would fill it — so the wide case is the one that
 * discriminates, and it is asserted first.
 */
/**
 * 46rem against the root's 16px default — the CAP `chrome-styles.ts` shares
 * with the header, and a ceiling rather than a width.
 *
 * Measured, not assumed: at a 900px container the band comes back **728px**,
 * not 736. `.hexdev-chrome-games` carries `margin-inline: auto`, and a flex
 * item with an auto cross-axis margin is not stretched — it is shrink-to-fit,
 * so the row is exactly two 22rem tracks plus the `--hx-space-lg` gap. The
 * band has always behaved this way; sections did not change it. So the fence
 * below asserts the SHARING (the title's box is its band's box) and the cap,
 * never the number — which is also the only form that catches the real
 * failure, since a heading inside the grid would measure one 352px track
 * against a 728px band.
 */
const BAND_PX = 46 * 16;

function mountedList(width: number, sections: readonly GameSection[]): HTMLElement {
  const el = fresh();
  el.style.width = `${width}px`;
  renderGameList(el, sections, { onOpenGame: noop });
  return el;
}

function firstShelf(el: HTMLElement): { readonly title: HTMLElement; readonly band: HTMLElement } {
  const shelf = el.querySelector<HTMLElement>(".hexdev-chrome-section")!;
  return { title: shelf.querySelector<HTMLElement>(".hexdev-chrome-section-title")!, band: shelf.querySelector<HTMLElement>(".hexdev-chrome-games")! };
}

describe("a shelf's title stands over its own cards, in the same 46rem band", () => {
  it("spans the whole band above the 720px grid tier, where a heading inside the grid would be one track", () => {
    const { title, band } = firstShelf(mountedList(900, TWO_SHELVES));
    expect(getComputedStyle(band).display, "sanity: the grid tier has to be engaged or this measurement proves nothing").toBe("grid");

    const titleBox = title.getBoundingClientRect();
    const bandBox = band.getBoundingClientRect();
    expect(bandBox.width, `the band measured ${bandBox.width}px, past the 46rem (${BAND_PX}px) cap it shares with the header`).toBeLessThanOrEqual(BAND_PX + 0.5);
    expect(Math.abs(titleBox.left - bandBox.left), `the title starts at ${titleBox.left}px and its own band at ${bandBox.left}px`).toBeLessThan(0.5);
    expect(Math.abs(titleBox.width - bandBox.width), `the title is ${titleBox.width}px wide against a ${bandBox.width}px band — a grid item would be ~352px`).toBeLessThan(0.5);
  });

  /* EVERY SHELF HANGS OFF ONE EDGE, and this is the defect the render showed
   * and no measurement did. The band is shrink-to-fit — an auto cross-axis
   * margin on a flex item turns stretch off — so a shelf of two games came
   * out 728px and a shelf of one came out 352px, each centred on its own
   * width, their labels 138px apart. The assertion above passed throughout,
   * because each label DID sit over its own cards. What was wrong was the
   * relationship BETWEEN shelves, and nothing was looking at it. */
  it("puts every shelf, and every shelf's first card, on the same left edge whatever it holds", () => {
    const el = mountedList(900, TWO_SHELVES);
    const shelves = [...el.querySelectorAll<HTMLElement>(".hexdev-chrome-section")];
    expect(shelves.length, "sanity: two shelves holding different numbers of games, or this proves nothing").toBe(2);

    const [wide, lone] = shelves.map((shelf) => ({
      title: shelf.querySelector<HTMLElement>(".hexdev-chrome-section-title")!.getBoundingClientRect(),
      card: shelf.querySelector<HTMLElement>(".hexdev-game-card")!.getBoundingClientRect(),
    }));
    expect(Math.abs(wide!.title.left - lone!.title.left), `the two shelf labels start at ${wide!.title.left}px and ${lone!.title.left}px`).toBeLessThan(0.5);
    for (const shelf of [wide!, lone!]) {
      expect(Math.abs(shelf.card.left - shelf.title.left), `a shelf's first card starts at ${shelf.card.left}px, its own label at ${shelf.title.left}px`).toBeLessThan(0.5);
    }
  });

  it("still starts with its column below the tier, where the band is a flex column and narrower than the cap", () => {
    const { title, band } = firstShelf(mountedList(600, TWO_SHELVES));
    expect(getComputedStyle(band).display, "sanity: this case must be BELOW the grid tier").toBe("flex");

    const titleBox = title.getBoundingClientRect();
    const bandBox = band.getBoundingClientRect();
    expect(bandBox.width, "sanity: below the cap, so the band is the column's own width").toBeLessThan(BAND_PX);
    expect(Math.abs(titleBox.left - bandBox.left)).toBeLessThan(0.5);
    expect(Math.abs(titleBox.width - bandBox.width)).toBeLessThan(0.5);
  });
});

/**
 * THE LEVEL STEPS, THE VOICE DOES NOT — and this is the half no `tagName`
 * assertion can see.
 *
 * `chrome-styles.ts` styles the card's name BY TAG (`.hexdev-game-card h2`):
 * family, size, weight, tracking, colour and ink shadow all hang off that
 * one selector. Moving the name to `<h3>` for the outline's sake drops every
 * one of them and leaves the browser's own bold 1.17em — a visibly different
 * card, with `tsc`, `eslint`, `depcruise` and every structural assertion in
 * this file still green. Found by reading the stylesheet, not by a test, and
 * this is that reading turned into one.
 */
const nameType = (heading: HTMLElement): Record<string, string> => {
  const style = getComputedStyle(heading);
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    letterSpacing: style.letterSpacing,
    color: style.color,
    margin: style.margin,
    textShadow: style.textShadow,
  };
};

describe("a card's name reads the same at whichever level the outline puts it", () => {
  it("computes the same type treatment under a shelf heading as it does without one", () => {
    // The SAME element on both renders, because `renderGameList` replaces its
    // children: the computed values have to be read before the second render
    // detaches the first name.
    const el = fresh();
    renderGameList(el, oneSection([ALFA]), { onOpenGame: noop });
    const flat = nameType(el.querySelector<HTMLElement>(".hexdev-game-card h2")!);

    renderGameList(el, TWO_SHELVES, { onOpenGame: noop });
    const headed = nameType(el.querySelector<HTMLElement>(".hexdev-game-card h3")!);

    expect(headed, "the name lost its type treatment the moment its level stepped — chrome-styles.ts styles it by TAG").toEqual(flat);
  });
});
