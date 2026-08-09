import { afterEach, describe, expect, it, vi } from "vitest";
import type { LobbyDisplayEntry } from "@hexdev/platform-core";
import type { GameId } from "@hexdev/platform-contract";
import { CHROME_STYLE_ID } from "./chrome-styles.js";
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

describe("renderGameSelection — a 4-seat modality (2v2) never offers a queue with no way to pair four (obs 2927/2925's own named matchmaking gap)", () => {
  it("never renders a vs-person button for a 4-seat game, even when the (unused) presence entry reports waiting players", () => {
    const el = freshContainer();
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_2V2_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 3, promoteBotFallback: false }]],
    ]);

    renderGameSelection(el, [TRUCO_2V2_ENTRY], presence, { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.querySelector('button[data-action="vs-person"]')).toBeNull();
    expect(el.querySelectorAll('button[data-action="vs-bot"]').length).toBeGreaterThan(0);
  });

  it("still renders a 2-seat game's vs-person button unchanged when both a 2-seat and a 4-seat game are in the catalog", () => {
    const el = freshContainer();
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [TRUCO_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 2, promoteBotFallback: false }]],
      [TRUCO_2V2_ID, [{ modality: { pointsToWin: 15 }, waitingCount: 0, promoteBotFallback: true }]],
    ]);

    renderGameSelection(el, [TRUCO_ENTRY, TRUCO_2V2_ENTRY], presence, { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.querySelectorAll('button[data-action="vs-person"]')).toHaveLength(1);
  });
});

describe("renderGameSelection — chrome styling (design §10: this screen takes the tenant's brand, obs 2955)", () => {
  it("styles the screen as chrome and injects the chrome stylesheet exactly once", () => {
    const el = freshContainer();

    renderGameSelection(el, [TRUCO_ENTRY], new Map(), { onPlayVsPerson: noop, onPlayVsBot: noop });

    expect(el.className).toBe("hexdev-gamify-chrome");
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
