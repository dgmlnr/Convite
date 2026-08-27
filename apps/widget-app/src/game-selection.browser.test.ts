import { afterEach, describe, expect, it, vi } from "vitest";
import type { LobbyDisplayEntry } from "@hexdev/platform-core";
import type { GameId } from "@hexdev/platform-contract";
import { CHROME_STYLE_ID, DEAL_DURATION_MS, DEAL_STAGGER_MS } from "./chrome-styles.js";
import { GAME_UI_HERO } from "./game-ui-registry.js";
import { captureFocus, restoreFocus } from "./focus-continuity.js";
import { renderGameSelection } from "./game-selection.js";
import type { CatalogEntry } from "./bootstrap-data.js";

const TRUCO_ID = "truco-argentino" as GameId;

const TRUCO_2V2_ID = "truco-argentino-2v2" as GameId;

const TRUCO_ENTRY: CatalogEntry = {
  id: TRUCO_ID,
  displayNameKey: "games.truco.name",
  seatCount: 2,
  configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
};

const TRUCO_2V2_ENTRY: CatalogEntry = {
  id: TRUCO_2V2_ID,
  displayNameKey: "games.truco2v2.name",
  seatCount: 4,
  configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
};

let container: HTMLElement;

afterEach(() => {
  container.remove();
  document.getElementById(CHROME_STYLE_ID)?.remove();
});

function freshContainer(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

function noop(): void {
  // intentionally empty default callback for tests that don't assert on it
}

describe("renderGameSelection (spec: game-session — the widget's opening view)", () => {
  it("shows an empty-state message when the tenant has no entitled games", () => {
    const el = freshContainer();

    renderGameSelection(el, [], new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.textContent).toContain("Este sitio todavía no tiene juegos habilitados.");
  });

  it("renders the entitled game's translated Spanish name", () => {
    const el = freshContainer();

    renderGameSelection(el, [TRUCO_ENTRY], new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.textContent).toContain("Truco Argentino");
  });

  it("shows the waiting-player count and a vs-person button when players are waiting (non-zero counter)", () => {
    const el = freshContainer();
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 2, promoteBotFallback: false }]],
    ]);

    renderGameSelection(el, [TRUCO_ENTRY], presence, { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.textContent).toContain("2 jugadores esperando");
    expect(el.querySelector('button[data-action="vs-person"]')).not.toBeNull();
  });

  it("hides the zero-count text and shows a prominent bot CTA (zero-counter UX rule)", () => {
    const el = freshContainer();
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_ID, [{ modality: { pointsToWin: 30 }, waitingCount: undefined, promoteBotFallback: true }]],
    ]);

    renderGameSelection(el, [TRUCO_ENTRY], presence, { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.textContent).not.toContain("0 jugador");
    const botButtons = el.querySelectorAll('button[data-action="vs-bot"]');
    expect(botButtons.length).toBeGreaterThan(0);
  });

  it("clicking the vs-person button invokes onPlayVsPerson with the game id and that exact modality", () => {
    const el = freshContainer();
    const onPlayVsPerson = vi.fn();
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 3, promoteBotFallback: false }]],
    ]);

    renderGameSelection(el, [TRUCO_ENTRY], presence, { onPlayVsPerson, onPlayVsBot: noop });
    el.querySelector<HTMLButtonElement>('button[data-action="vs-person"]')?.click();

    expect(onPlayVsPerson).toHaveBeenCalledWith(TRUCO_ID, { pointsToWin: 15 });
  });

  it("clicking a difficulty button invokes onPlayVsBot with the chosen tier", () => {
    const el = freshContainer();
    const onPlayVsBot = vi.fn();
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 1, promoteBotFallback: false }]],
    ]);

    renderGameSelection(el, [TRUCO_ENTRY], presence, { onPlayVsPerson: noop, onPlayVsBot });
    el.querySelector<HTMLButtonElement>('button[data-action="vs-bot"][data-tier="hard"]')?.click();

    expect(onPlayVsBot).toHaveBeenCalledWith(TRUCO_ID, { pointsToWin: 15 }, "hard");
  });
});

describe("renderGameSelection — a 4-seat modality (2v2) queues like any other: the platform now fulfils it via PR-2b's bot-fill degradation", () => {
  it("renders a vs-person button for a 4-seat game with waiting players — the seat-count gate died with the matchmaking gap it guarded", () => {
    const el = freshContainer();
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_2V2_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 3, promoteBotFallback: false }]],
    ]);

    renderGameSelection(el, [TRUCO_2V2_ENTRY], presence, { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.querySelector('button[data-action="vs-person"]')).not.toBeNull();
    expect(el.querySelectorAll('button[data-action="vs-bot"]').length).toBeGreaterThan(0);
  });

  it("renders vs-person buttons for BOTH a 2-seat and a 4-seat game in the same catalog — no per-seat-count asymmetry left", () => {
    const el = freshContainer();
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 2, promoteBotFallback: false }]],
      [TRUCO_2V2_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 0, promoteBotFallback: true }]],
    ]);

    renderGameSelection(el, [TRUCO_ENTRY, TRUCO_2V2_ENTRY], presence, { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.querySelectorAll('button[data-action="vs-person"]')).toHaveLength(2);
  });
});

describe("renderGameSelection — chrome styling (design §10: this screen takes the tenant's brand, obs 2955)", () => {
  it("styles the screen as chrome and injects the chrome stylesheet exactly once", () => {
    const el = freshContainer();

    renderGameSelection(el, [TRUCO_ENTRY], new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.className).toBe("convite-chrome");
    expect(el.querySelector("h1")?.className).toBe("hexdev-chrome-title");
    expect(document.head.querySelectorAll(`#${CHROME_STYLE_ID}`)).toHaveLength(1);
  });

  it("marks the prominent action as vs-person when real players are waiting (non-zero counter)", () => {
    const el = freshContainer();
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 2, promoteBotFallback: false }]],
    ]);

    renderGameSelection(el, [TRUCO_ENTRY], presence, { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.querySelector(".hexdev-modality")?.getAttribute("data-prominent")).toBe("person");
  });

  it("marks the prominent action as vs-bot when the zero-counter UX rule applies", () => {
    const el = freshContainer();
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_ID, [{ modality: { pointsToWin: 30 }, waitingCount: undefined, promoteBotFallback: true }]],
    ]);

    renderGameSelection(el, [TRUCO_ENTRY], presence, { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.querySelector(".hexdev-modality")?.getAttribute("data-prominent")).toBe("bot");
  });
});

describe("renderGameSelection — keyboard focus survives a live presence re-render (WCAG 2.1.1/2.4.3: every counts broadcast used to wipe the DOM and dump focus on <body>)", () => {
  const CALLBACKS = { onPlayVsPerson: noop, onPlayVsBot: noop };

  function presenceWith(waitingCount: number | undefined): ReadonlyMap<GameId, readonly LobbyDisplayEntry[]> {
    return new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_ID, [{ modality: { pointsToWin: 15 }, waitingCount, promoteBotFallback: waitingCount === undefined }]],
    ]);
  }

  it("keeps focus on the vs-person button when a counts broadcast re-renders identical content", () => {
    const el = freshContainer();
    renderGameSelection(el, [TRUCO_ENTRY], presenceWith(2), CALLBACKS);
    el.querySelector<HTMLButtonElement>('button[data-action="vs-person"]')!.focus();

    renderGameSelection(el, [TRUCO_ENTRY], presenceWith(2), CALLBACKS);

    const focused = document.activeElement as HTMLElement;
    expect(focused.dataset.action).toBe("vs-person");
    expect(el.contains(focused)).toBe(true);
  });

  it("restores focus to the equivalent bot-tier button when the re-render changes the waiting count", () => {
    const el = freshContainer();
    renderGameSelection(el, [TRUCO_ENTRY], presenceWith(2), CALLBACKS);
    el.querySelector<HTMLButtonElement>('button[data-action="vs-bot"][data-tier="hard"]')!.focus();

    renderGameSelection(el, [TRUCO_ENTRY], presenceWith(5), CALLBACKS);

    const focused = document.activeElement as HTMLElement;
    expect(focused.dataset.action).toBe("vs-bot");
    expect(focused.dataset.tier).toBe("hard");
  });

  it("moves focus to the container itself — never <body> — when the focused control's whole modality is gone", () => {
    const el = freshContainer();
    renderGameSelection(el, [TRUCO_ENTRY], presenceWith(2), CALLBACKS);
    el.querySelector<HTMLButtonElement>('button[data-action="vs-person"]')!.focus();

    const otherModality = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_ID, [{ modality: { pointsToWin: 30 }, waitingCount: undefined, promoteBotFallback: true }]],
    ]);
    renderGameSelection(el, [TRUCO_ENTRY], otherModality, CALLBACKS);

    expect(document.activeElement).toBe(el);
    expect(el.getAttribute("tabindex")).toBe("-1");
  });

  // The region rung (rung 3 of focus-continuity.ts's ladder), driven through
  // the helper DIRECTLY: renderGameSelection's own DOM cannot reach it —
  // every modality always renders its vs-person button AND all three bot
  // tiers together, so a leaf's exact/group selectors always find a live
  // match whenever the modality itself survived. The rung still guards the
  // lobby against any future shape where a whole action disappears from a
  // surviving group, and an untested rung is exactly the kind of dead-until-
  // needed code that rots — hence this pin at the helper's own seam.
  it("region rung: lands on a surviving control with a DIFFERENT action in the same scope when exact and group both fail", () => {
    const el = freshContainer();
    const modality = document.createElement("div");
    modality.dataset.modality = "pointsToWin=15";
    const person = document.createElement("button");
    person.dataset.action = "vs-person";
    const bot = document.createElement("button");
    bot.dataset.action = "vs-bot";
    bot.dataset.tier = "easy";
    modality.append(person, bot);
    el.appendChild(modality);
    person.focus();

    const snapshot = captureFocus(el);
    person.remove(); // the whole vs-person affordance is gone; the modality and its bot button survive
    restoreFocus(el, snapshot);

    expect(document.activeElement).toBe(bot);
  });

  // PIN, green from birth: the lobby never grabbed focus from outside itself,
  // and the restore mechanism must keep it that way — restoring is only legal
  // when focus was INSIDE the container at wipe time.
  it("never steals focus that was outside the widget when a re-render happens", () => {
    const el = freshContainer();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    renderGameSelection(el, [TRUCO_ENTRY], presenceWith(2), CALLBACKS);
    outside.focus();

    renderGameSelection(el, [TRUCO_ENTRY], presenceWith(5), CALLBACKS);

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe("chrome owns its focus indicator (2.4.7: a host CSS reset must not leave keyboard users with no ring at all)", () => {
  it("paints a 2px solid outline in the button's own text colour under :focus-visible", () => {
    const el = freshContainer();
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 2, promoteBotFallback: false }]],
    ]);
    renderGameSelection(el, [TRUCO_ENTRY], presence, { onPlayVsPerson: noop, onPlayVsBot: noop });

    const button = el.querySelector<HTMLButtonElement>('button[data-action="vs-person"]')!;
    button.focus();

    const style = getComputedStyle(button);
    expect(style.outlineWidth).toBe("2px");
    expect(style.outlineStyle).toBe("solid");
    // currentColor: the ring inherits the label's own contrast guarantee.
    expect(style.outlineColor).toBe(style.color);
  });
});

describe("chrome body copy consumes --hx-leading (FU-5: computed line-height contract)", () => {
  it("gives the modality description a computed line-height of 1.35x its computed font-size", () => {
    const el = freshContainer();
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 2, promoteBotFallback: false }]],
    ]);

    renderGameSelection(el, [TRUCO_ENTRY], presence, { onPlayVsPerson: noop, onPlayVsBot: noop });

    const description = el.querySelector<HTMLElement>(".hexdev-modality-title");
    expect(description).not.toBeNull();
    const style = getComputedStyle(description!);
    const lineHeight = Number.parseFloat(style.lineHeight);
    expect(lineHeight).toBeCloseTo(Number.parseFloat(style.fontSize) * 1.35, 0);
  });

  it("keeps the bot-CTA paragraph on the same leading — the rule covers the modality's prose, not just its heading", () => {
    const el = freshContainer();
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 2, promoteBotFallback: false }]],
    ]);

    renderGameSelection(el, [TRUCO_ENTRY], presence, { onPlayVsPerson: noop, onPlayVsBot: noop });

    const style = getComputedStyle(el.querySelector<HTMLElement>(".hexdev-modality p:not(.hexdev-modality-count)")!);
    expect(Number.parseFloat(style.lineHeight)).toBeCloseTo(Number.parseFloat(style.fontSize) * 1.35, 0);
  });
});

/**
 * WCAG 1.3.1 / 2.4.6 (B14). Two defects in one box.
 *
 * STRUCTURE: the line naming a modality ("Puntos: 15") is the
 * heading of everything under it, and it was a `<p>` — so the lobby's outline
 * ended at the game name and a reader jumping by heading could not reach, or
 * even count, the modalities inside a game.
 *
 * NAMES: every modality repeats the same three bot tiers, so a lobby with two
 * modalities offers "Fácil" three times over with nothing programmatic saying
 * which board each belongs to. The buttons cannot be renamed — "Fácil" is the
 * right visible label — so the disambiguation has to come from a named GROUP
 * around them, which is what `role="group"` plus an `aria-label` is for.
 *
 * PAINT MUST NOT MOVE. `.hexdev-modality p` and the --hx-leading rule both
 * target the `p` TAG, so promoting the heading is exactly the kind of change
 * that silently repaints — hence the computed-style assertions below rather
 * than a bare tag-name check.
 */
describe("lobby structure and group naming (WCAG 1.3.1 / 2.4.6)", () => {
  const TWO_MODALITIES: readonly LobbyDisplayEntry[] = [
    { modality: { pointsToWin: 15 }, waitingCount: 2, promoteBotFallback: false },
    { modality: { pointsToWin: 30 }, waitingCount: undefined, promoteBotFallback: true },
  ];

  function renderTwoModalities(): HTMLElement {
    const el = freshContainer();
    renderGameSelection(el, [TRUCO_ENTRY], new Map([[TRUCO_ID, TWO_MODALITIES]]), { onPlayVsPerson: noop, onPlayVsBot: noop });
    return el;
  }

  it("makes the modality line a real heading, one level below the card heading that owns it", () => {
    // ONE heading now, not one per modality: the card shows the SELECTED
    // modality and offers the rest as a picker above it. The heading is still
    // an H3 under the card's H2 (WCAG 1.3.1) — it names the block of controls
    // under it, and that block is now singular.
    //
    // The H2 reads "Mano a mano" and no longer "Truco Argentino": under a hero
    // that already names the game, a card names its FORMAT. What this test is
    // really about is the LEVELS, and those are unchanged.
    const el = renderTwoModalities();

    const gameHeading = el.querySelector<HTMLElement>(".hexdev-game-card h2");
    const modalityHeadings = [...el.querySelectorAll<HTMLElement>(".hexdev-modality-title")];
    expect(gameHeading?.textContent).toBe("Mano a mano");
    expect(modalityHeadings.map((heading) => heading.tagName)).toEqual(["H3"]);
    expect(modalityHeadings[0]?.textContent).toBe("Puntos: 15");
  });

  it("offers the other modalities as a picker, with exactly one pressed", () => {
    const el = renderTwoModalities();

    const options = [...el.querySelectorAll<HTMLElement>(".hexdev-modality-option")];
    expect(options.map((option) => option.textContent)).toEqual(["Puntos: 15", "Puntos: 30"]);
    expect(options.filter((option) => option.getAttribute("aria-pressed") === "true")).toHaveLength(1);
  });

  it("switches what the card shows when another modality is picked, and remembers it across a repaint", () => {
    // THE DEFECT THIS GUARDS. The lobby wipes and rebuilds on every presence
    // broadcast, so a selection held in the DOM would be undone every few
    // seconds — and one read back OFF the DOM would read the value the click
    // was replacing and never take at all. Both were live at some point while
    // this was being written.
    const el = renderTwoModalities();

    el.querySelectorAll<HTMLElement>(".hexdev-modality-option")[1]!.click();
    expect(el.querySelector<HTMLElement>(".hexdev-modality-title")?.textContent).toBe("Puntos: 30");

    renderGameSelection(el, [TRUCO_ENTRY], new Map([[TRUCO_ID, TWO_MODALITIES]]), { onPlayVsPerson: noop, onPlayVsBot: noop });
    expect(el.querySelector<HTMLElement>(".hexdev-modality-title")?.textContent, "a presence broadcast undid the player's choice").toBe("Puntos: 30");
  });

  it("lets no heading UA default through — every one of them is set on purpose", () => {
    // WHAT THIS PROTECTS, and it is not the exact values. When this line
    // became a real <h3> for WCAG 1.3.1, the risk was the browser's own
    // heading defaults leaking in: bold, 1.17em, and block margins nobody
    // asked for. The original wording of this test froze the paint to match
    // the <p> it replaced, which caught that — and also froze the design.
    //
    // It is now a LABEL by deliberate choice (small, letterspaced, uppercase,
    // secondary): "Puntos: 15" is a section marker that repeats
    // once per modality, and set as a sentence it was read instead of
    // scanned. So the assertion moved to the invariant that actually mattered:
    // nothing here is a UA default. Every property a heading would otherwise
    // contribute is named by the stylesheet.
    // A card with ONE modality, deliberately: with two there is a picker
    // above, the heading becomes screen-reader-only, and its paint is then a
    // statement about a clip rect rather than about typography. The invariant
    // — no UA heading default reaches the page — is about the VISIBLE one.
    const el = freshContainer();
    renderGameSelection(el, [TRUCO_ENTRY], new Map([[TRUCO_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 2, promoteBotFallback: false }]]]), { onPlayVsPerson: noop, onPlayVsBot: noop });

    const heading = getComputedStyle(el.querySelector<HTMLElement>(".hexdev-modality-title")!);
    // The chrome root's own size, NOT a sibling's: a sibling is something this
    // design may restyle tomorrow, and a fence anchored to one drifts with it.
    // (It already did — this compared against the bot cue, which then became a
    // label too, and the assertion started measuring two equals.)
    const base = Number.parseFloat(getComputedStyle(el).fontSize);

    expect([heading.marginTop, heading.marginBottom], "a heading's block margins reached the page").toEqual(["0px", "0px"]);
    // 1.17em is the UA default for h3 — the size must come from a token,
    // whatever that token currently is, never from the browser's idea of a
    // heading. Smaller than the body size is the shape a marker has and the
    // shape a UA heading never has.
    expect(Number.parseFloat(heading.fontSize), "the UA's heading size reached the page").toBeLessThan(base);
    expect(heading.textTransform, "styled as a marker, not as a sentence").toBe("uppercase");
    expect(Number.parseFloat(heading.letterSpacing)).toBeGreaterThan(0);
  });

  it("names the tier board as a group, so its repeated labels stay distinguishable", () => {
    const el = renderTwoModalities();

    const groups = [...el.querySelectorAll<HTMLElement>(".hexdev-modality")];
    expect(groups.map((group) => group.getAttribute("role"))).toEqual(["group"]);
    expect(groups[0]?.getAttribute("aria-label")).toBe("Truco Argentino, Puntos: 15");
  });

  it("gives every repeated tier button a distinct group name — the whole point, asserted end to end", () => {
    const el = freshContainer();
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_ID, TWO_MODALITIES],
      [TRUCO_2V2_ID, TWO_MODALITIES],
    ]);

    renderGameSelection(el, [TRUCO_ENTRY, TRUCO_2V2_ENTRY], presence, { onPlayVsPerson: noop, onPlayVsBot: noop });

    // The repetition SHRANK but did not vanish, which is the point of keeping
    // this test rather than deleting it with the layout that caused it. One
    // tier board per game instead of one per modality means two "Fácil"
    // buttons on this screen instead of four — and two still need telling
    // apart, because a screen reader hears the same word twice either way.
    const easyButtons = [...el.querySelectorAll<HTMLElement>('button[data-tier="easy"]')];
    expect(easyButtons).toHaveLength(2);
    const groupNames = easyButtons.map((button) => button.closest(".hexdev-modality")?.getAttribute("aria-label"));
    expect(new Set(groupNames).size, `repeated "Fácil" buttons under ${JSON.stringify(groupNames)}`).toBe(2);
  });
});

/**
 * THE DECK CREDIT IS A LICENSE TERM, and this is the surface that satisfies it.
 *
 * The card artwork is CC BY-SA 3.0, which asks for three things: the author,
 * a link to the license, and a statement that changes were made. A credit
 * that lives only in a source constant is not GIVEN to the people who see
 * the work — so `about.ts` fences the data and this fences that a player can
 * actually reach all three.
 *
 * Each term gets its own test on purpose. A credit that quietly loses one of
 * them still looks like a credit on screen, which is exactly why a single
 * "renders the panel" assertion would be worth very little here.
 */
describe("the deck credit reaches the player", () => {
  const about = (): HTMLDetailsElement | null => container.querySelector<HTMLDetailsElement>(".hexdev-about");
  const openAbout = (): void => {
    const details = about();
    if (details === null) throw new Error("fence setup: the credit disclosure never rendered");
    details.open = true;
  };

  it("offers a control with a real accessible name, not the letter it draws", () => {
    renderGameSelection(freshContainer(), [TRUCO_ENTRY], new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop });
    const summary = container.querySelector<HTMLElement>(".hexdev-about-toggle");

    expect(summary, "nothing credits the artwork at all").not.toBeNull();
    // The glyph is an "i"; a screen reader announcing "i" tells nobody
    // anything, so the accessible name has to be the real one.
    expect(summary!.textContent?.trim()).toBe("i");
    expect(summary!.getAttribute("aria-label")?.length ?? 0, "the control announces itself as the letter it draws").toBeGreaterThan(3);
  });

  it("names the author", () => {
    renderGameSelection(freshContainer(), [TRUCO_ENTRY], new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop });
    openAbout();

    expect(container.querySelector(".hexdev-about-panel")?.textContent ?? "").toContain("Basquetteur");
  });

  it("links the license itself, and says which one it is", () => {
    renderGameSelection(freshContainer(), [TRUCO_ENTRY], new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop });
    openAbout();
    const hrefs = [...container.querySelectorAll<HTMLAnchorElement>(".hexdev-about-links a")].map((a) => a.href);

    expect(hrefs, `the panel links: ${hrefs.join(", ") || "nothing"}`).toContain("https://creativecommons.org/licenses/by-sa/3.0/");
    expect(container.querySelector(".hexdev-about-panel")?.textContent ?? "").toContain("CC BY-SA 3.0");
  });

  it("states that changes were made", () => {
    // The term easiest to drop, and the reason it is a required field on
    // `DeckAttribution` rather than something a renderer may skip.
    renderGameSelection(freshContainer(), [TRUCO_ENTRY], new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop });
    openAbout();

    expect((container.querySelector(".hexdev-about-panel")?.textContent ?? "").toLowerCase()).toContain("cambios");
  });

  it("never navigates the host page away from the game", () => {
    // This widget is embedded in somebody else's site. A credit link that
    // replaced the host page would be the most expensive footnote in the
    // product.
    renderGameSelection(freshContainer(), [TRUCO_ENTRY], new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop });
    openAbout();

    for (const anchor of container.querySelectorAll<HTMLAnchorElement>(".hexdev-about-links a")) {
      expect(anchor.target).toBe("_blank");
      expect(anchor.rel).toContain("noopener");
    }
  });

  it("credits the same deck ONCE, though two games draw it", () => {
    renderGameSelection(freshContainer(), [TRUCO_ENTRY, TRUCO_2V2_ENTRY], new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop });
    openAbout();

    // Both truco entries declare the same artwork. Two identical credits
    // stacked on one screen reads as a bug, not as diligence.
    expect(container.querySelectorAll(".hexdev-about-credit")).toHaveLength(1);
  });

  it("stays open across a re-render — a live lobby repaints every few seconds", () => {
    // THE DEFECT THIS EXISTS FOR. `renderGameSelection` wipes and rebuilds on
    // every presence broadcast (that is why it captures and restores focus at
    // all), so a panel the player had opened to READ would slam shut under
    // them on a timer.
    const el = freshContainer();
    renderGameSelection(el, [TRUCO_ENTRY], new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop });
    openAbout();

    renderGameSelection(el, [TRUCO_ENTRY], new Map([[TRUCO_ID, [] as readonly LobbyDisplayEntry[]]]), { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(about()?.open, "the credit closed itself while the player was reading it").toBe(true);
  });

  it("is reachable even when the tenant has no games enabled", () => {
    // That screen still ships the deck art in the bundle, so it still owes
    // the credit.
    renderGameSelection(freshContainer(), [], new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(about(), "the empty lobby drops the credit").not.toBeNull();
  });
});

/**
 * GOLD TYPE HAS TO FIT ITS OWN BOX.
 *
 * `background-clip: text` paints the gradient into the element's BACKGROUND
 * BOX and uses the glyphs as a mask. Anything sticking out of that box gets no
 * paint — so a line box shorter than the font silently amputates every
 * descender and every accent. Not clipped by an overflow, which is what makes
 * it hard to find: unpainted.
 *
 * IT SHIPPED, and it was reported by somebody LOOKING at the screen after
 * every test in this repo passed — because every computed value was correct.
 * The line-height was what it was set to, the colour was right, the filter was
 * right, and the tail of every g and j was gone.
 *
 * This is the proxy that can be automated: the element's own box has to be at
 * least as tall as the line it renders. It cannot see ink, so it will not
 * catch a font with unusually deep descenders — but it catches the whole class
 * of "somebody tightened the leading on clipped text", which is what happened.
 */
describe("the clipped-gold title is not amputated by its own line box", () => {
  it("gives the title a box at least as tall as the text inside it", () => {
    const el = freshContainer();
    renderGameSelection(el, [TRUCO_ENTRY], new Map([[TRUCO_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 2, promoteBotFallback: false }]]]), { onPlayVsPerson: noop, onPlayVsBot: noop });

    const title = el.querySelector<HTMLElement>(".hexdev-chrome-title")!;
    const style = getComputedStyle(title);
    expect(style.backgroundClip === "text" || style.webkitBackgroundClip === "text", "fence setup: this title is no longer clipped gold").toBe(true);

    const range = document.createRange();
    range.selectNodeContents(title);

    expect(
      title.getBoundingClientRect().height,
      "the title's box is shorter than its own text, so background-clip is cutting the descenders off",
    ).toBeGreaterThanOrEqual(range.getBoundingClientRect().height);
  });

  it("keeps a line-height that can hold a serif's accents and descenders", () => {
    // The same defect stated as the number somebody would actually change.
    // 1.15 is the floor: below it a Georgia-class face runs out of box before
    // it runs out of glyph.
    const el = freshContainer();
    renderGameSelection(el, [TRUCO_ENTRY], new Map([[TRUCO_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 2, promoteBotFallback: false }]]]), { onPlayVsPerson: noop, onPlayVsBot: noop });

    const style = getComputedStyle(el.querySelector<HTMLElement>(".hexdev-chrome-title")!);
    const ratio = Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize);

    expect(ratio, `line-height is ${ratio.toFixed(2)}x the font size — too tight for clipped text`).toBeGreaterThanOrEqual(1.15);
  });
});

/**
 * THE HAND IS DEALT ONCE.
 *
 * The deal is a greeting: it says "you have arrived at a table", and it says
 * it on arrival. But this screen wipes and rebuilds on every presence
 * broadcast — every few seconds on a live lobby — so an animation class
 * applied unconditionally re-ran the whole thing each time, and the cards
 * kept being re-dealt under a player who was trying to read the screen.
 *
 * It shipped that way and was reported as "no me gusta el efecto", which is
 * what a one-time flourish becomes when it is not one-time. The fix is a
 * per-container WeakSet; this is the fence, because the failure is invisible
 * in a single render and every test here does exactly one.
 */
describe("the hand is dealt once, not on every repaint", () => {
  const PRESENCE = new Map<GameId, readonly LobbyDisplayEntry[]>([[TRUCO_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 2, promoteBotFallback: false }]]]);

  it("animates the first render", () => {
    const el = freshContainer();
    renderGameSelection(el, [TRUCO_ENTRY], PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.querySelector(".hexdev-chrome-fan--dealing"), "the cards never arrive").not.toBeNull();
  });

  it("survives the repaint that lands nine milliseconds later", () => {
    // THE DEFECT, MEASURED IN THE RUNNING LOBBY. A MutationObserver installed
    // before the widget booted recorded this:
    //
    //   17ms RENDER fan=hexdev-chrome-fan hexdev-chrome-fan--dealing
    //   26ms RENDER fan=hexdev-chrome-fan
    //   ...one more render every second, forever
    //
    // The greeting was applied correctly and destroyed nine milliseconds
    // later by the next presence broadcast, which rebuilds the fan from
    // scratch. The animation needs about 680ms. It was reported as never
    // playing; it was playing, for nine milliseconds.
    //
    // The version of this fence that shipped the defect asserted the class
    // was GONE after a second render. It was written against a real concern
    // — the hand must not re-deal on every broadcast — but it could not tell
    // "restarted" from "still running", so it demanded the only behaviour
    // that guarantees nothing is ever seen. Those are separated now: this
    // fence owns "still running", the elapsed-offset one below owns "not
    // restarted", and the last one owns "eventually stops".
    const el = freshContainer();
    renderGameSelection(el, [TRUCO_ENTRY], PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });
    renderGameSelection(el, [TRUCO_ENTRY], PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.querySelector(".hexdev-chrome-fan"), "fence setup: the fan stopped rendering at all").not.toBeNull();
    expect(
      el.querySelector(".hexdev-chrome-fan--dealing"),
      "a repaint mid-greeting threw the deal away",
    ).not.toBeNull();
  });

  it("resumes where it was instead of replaying from the first card", () => {
    // Why an offset is needed at all, and not just the class: removing an
    // element from the document CANCELS its CSS animations, and re-inserting
    // it starts them again at zero. Measured in the running lobby, not
    // assumed — before removal the animation read `currentTime: 118`, while
    // disconnected it was gone entirely, and after re-insertion it read
    // `currentTime: 0`.
    //
    // So a rebuilt fan that merely kept the class would restart the deal on
    // every presence broadcast: a hand that deals itself again once a second
    // and never finishes. Publishing how long ago the greeting began lets the
    // rebuilt cards pick the animation up mid-flight through a negative
    // animation-delay, which is what makes it look continuous.
    vi.useFakeTimers();
    try {
      const el = freshContainer();
      renderGameSelection(el, [TRUCO_ENTRY], PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });
      vi.advanceTimersByTime(200);
      renderGameSelection(el, [TRUCO_ENTRY], PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });

      const fan = el.querySelector<HTMLElement>(".hexdev-chrome-fan--dealing");
      expect(fan, "fence setup: the greeting did not survive to be resumed").not.toBeNull();
      expect(
        fan?.style.getPropertyValue("--elapsed").trim(),
        "the rebuilt hand deals itself again from the first card",
      ).toBe("200ms");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops greeting once the deal has had time to land", () => {
    // The concern the replaced fence was protecting, kept: a lobby left open
    // repaints every second for as long as the player looks at it, and none
    // of those repaints may deal a hand. The greeting is over when its own
    // last card has finished — stagger for the last index plus one duration —
    // and the numbers come from the stylesheet that animates it, so this can
    // never disagree with the CSS about when that is.
    vi.useFakeTimers();
    try {
      const el = freshContainer();
      renderGameSelection(el, [TRUCO_ENTRY], PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });
      vi.advanceTimersByTime(DEAL_DURATION_MS + DEAL_STAGGER_MS * GAME_UI_HERO.length);
      renderGameSelection(el, [TRUCO_ENTRY], PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });

      expect(el.querySelector(".hexdev-chrome-fan"), "fence setup: the fan stopped rendering at all").not.toBeNull();
      expect(
        el.querySelector(".hexdev-chrome-fan--dealing"),
        "the lobby keeps re-dealing the hand for as long as it is open",
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not spend the greeting on a lobby that is still loading", () => {
    // THE DEFECT THIS EXISTS FOR, and it is the one the first fix caused.
    // `main.ts` renders this screen the moment the catalog arrives — with no
    // presence yet, so every card reads "Cargando…" — and again when the
    // counts land. "Once" meaning "on the first call" spent the whole
    // greeting on the loading state, and the animation was reported as never
    // playing at all. It was playing; nobody could see it.
    const el = freshContainer();

    renderGameSelection(el, [TRUCO_ENTRY], new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop });
    expect(el.querySelector(".hexdev-chrome-loading"), "fence setup: this render is not a loading one").not.toBeNull();
    expect(el.querySelector(".hexdev-chrome-fan--dealing"), "the greeting was spent on a loading screen").toBeNull();

    renderGameSelection(el, [TRUCO_ENTRY], PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });
    expect(el.querySelector(".hexdev-chrome-fan--dealing"), "the first playable render did not deal").not.toBeNull();
  });

  it("deals again for a different container — the greeting belongs to a mount, not to the page", () => {
    const first = freshContainer();
    renderGameSelection(first, [TRUCO_ENTRY], PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });
    const second = freshContainer();
    renderGameSelection(second, [TRUCO_ENTRY], PRESENCE, { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(second.querySelector(".hexdev-chrome-fan--dealing"), "a second widget on the page opened with no greeting").not.toBeNull();
  });
});

/**
 * THE LOBBY SAYS EACH THING ONCE, AND SAYS IT ON ONE LINE.
 *
 * Two defects from the same place -- the copy over the cards -- both found by
 * measuring the rendered lobby rather than by reading it.
 */
describe("the lobby's own copy fits and does not repeat itself", () => {
  const PRESENCE_BOTH = new Map<GameId, readonly LobbyDisplayEntry[]>([
    [TRUCO_ID, [
      { modality: { pointsToWin: 15 }, waitingCount: undefined, promoteBotFallback: true },
      { modality: { pointsToWin: 30 }, waitingCount: undefined, promoteBotFallback: true },
    ]],
    [TRUCO_2V2_ID, [
      { modality: { pointsToWin: 15 }, waitingCount: undefined, promoteBotFallback: true },
      { modality: { pointsToWin: 30 }, waitingCount: undefined, promoteBotFallback: true },
    ]],
  ]);

  /** Line boxes, which is the only thing that really says "this wrapped". */
  function lineCount(el: HTMLElement): number {
    const range = el.ownerDocument.createRange();
    range.selectNodeContents(el);
    return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
  }

  /*
   * THE MODALITY BUTTONS BROKE IN TWO. Measured at 320 and 375: "Puntos para
   * ganar: 15" rendered across two line boxes inside a 42px button -- the
   * shape a player reads as "PUNTOS PARA / GANAR: 15".
   *
   * Text only, and that matters: this repo already learned that counting line
   * boxes on a button with an ICON gives a rect per inline element rather than
   * per line, and reported "Salir" as three lines at every width. These
   * buttons are pure text, which is exactly where the technique is valid.
   */
  it.each([320, 375, 414] as const)("%ipx: no modality button breaks across two lines", (width) => {
    const el = freshContainer();
    el.style.width = `${String(width)}px`;
    renderGameSelection(el, [TRUCO_ENTRY, TRUCO_2V2_ENTRY], PRESENCE_BOTH, { onPlayVsPerson: noop, onPlayVsBot: noop });

    const options = [...el.querySelectorAll<HTMLElement>(".hexdev-modality-option")];
    expect(options.length, "fence setup: no modality buttons rendered, so this asserts nothing").toBeGreaterThan(0);

    for (const option of options) {
      expect(lineCount(option), `"${option.textContent ?? ""}" at ${String(width)}px`).toBe(1);
    }
  });

  /*
   * AND THE HERO'S OWN NAME IS NOT REPEATED UNDER IT. The hero reads "Truco
   * Argentino" and the first card's heading read "Truco Argentino" too, word
   * for word, at every width. The cards are FORMATS of one game, not different
   * games, so where the hero has already named the game a card says which
   * format it is instead.
   *
   * Only where there IS a hero: a platform with no art gets no hero (see
   * renderGameSelection's own note), and there the card heading is the only
   * thing naming the game at all.
   */
  it("a card never repeats the hero's title back at the player", () => {
    const el = freshContainer();
    renderGameSelection(el, [TRUCO_ENTRY, TRUCO_2V2_ENTRY], PRESENCE_BOTH, { onPlayVsPerson: noop, onPlayVsBot: noop });

    const hero = el.querySelector<HTMLElement>("h1")?.textContent ?? "";
    expect(hero, "fence setup: no hero title, so there is nothing to repeat").not.toBe("");

    const headings = [...el.querySelectorAll<HTMLElement>(".hexdev-game-card h2")].map((h) => h.textContent ?? "");
    expect(headings.length, "fence setup: no cards rendered").toBeGreaterThan(0);
    expect(headings, `the hero says "${hero}" and a card says it again`).not.toContain(hero);

    // AND STILL TELLS THEM APART. Dropping the repeat by blanking the heading
    // would pass the line above and leave two identical-looking cards.
    expect(new Set(headings).size, `the cards must stay distinguishable: ${headings.join(" | ")}`).toBe(headings.length);
  });
});
