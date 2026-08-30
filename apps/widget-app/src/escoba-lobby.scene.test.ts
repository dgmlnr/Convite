/// <reference types="@vitest/browser/matchers" />
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { GameId } from "@hexdev/platform-contract";
import type { LobbyDisplayEntry } from "@hexdev/platform-core";
import type { CatalogEntry } from "./bootstrap-data.js";
import { groupByFamily } from "./game-families.js";
import { renderGameList } from "./game-list.js";
import { renderGameSelection } from "./game-screen.js";

/**
 * THE TWO LOBBY SCREENS, ONCE ESCOBA IS REALLY IN THEM.
 *
 * Scenes, not baselines: nothing here is compared against anything and
 * `pnpm visual:review` rewrites both images on every run
 * (`visual/decision-de-capturas-y-mediciones`). Their whole job is to put a
 * person in front of a whole screen, which is the one thing no
 * `getBoundingClientRect()` assertion replaces.
 *
 * WHY THEY EXIST ALONGSIDE THE SCENES ALREADY HERE. `game-list.scene.test.ts`
 * was written while escoba had no faces yet, so its second family is a
 * deliberately art-less stand-in whose SUBJECT is the empty art slot; and
 * `game-screen.scene.test.ts` only ever renders truco. Neither shows what
 * this platform actually looks like now that a second family declares its own
 * card art, its own hero and its own fixed modality line — so neither is
 * edited here. A scene about the empty slot stays a scene about the empty
 * slot.
 *
 * PHONE WIDTH, 375px. Both screens are the narrow branch of
 * `chrome-styles.ts`'s container query (the grid switches at 720px), which is
 * where a player embedded in somebody else's page actually meets them.
 */

/**
 * The catalog exactly as the server serves it — four joinable entries, two
 * families. Order is the SERVER's, and `groupByFamily` keeps it: a family
 * takes the position of its first entry, so truco leads because it is the
 * older game, never because of anything this file decided.
 */
const TRUCO_1V1: CatalogEntry = {
  id: "truco-argentino",
  gameFamily: "truco",
  section: "cartas",
  displayNameKey: "games.truco.name",
  seatCount: 2,
  configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
};

const TRUCO_2V2: CatalogEntry = {
  id: "truco-argentino-2v2",
  gameFamily: "truco",
  section: "cartas",
  displayNameKey: "games.truco2v2.name",
  seatCount: 4,
  configOptions: [{ key: "pointsToWin", labelKey: "games.truco.pointsToWin", values: [15, 30], defaultValue: 15 }],
};

/**
 * Escoba's two entries carry `configOptions: []` on purpose — art. 8.1 fixes
 * the match at thirty tantos, so there is no knob to offer (design §D5). That
 * emptiness is what makes `STRINGS.modalitySummary` the line these cards show
 * ("Partida a 30", `escoba/decisiones-de-ui-del-lobby`) instead of a computed
 * "<label>: <value>" one, and rendering it is half of what screen two is here
 * to prove.
 */
const ESCOBA_1V1: CatalogEntry = {
  id: "escoba-de-15",
  gameFamily: "escoba",
  section: "cartas",
  displayNameKey: "games.escoba.name",
  seatCount: 2,
  configOptions: [],
};

const ESCOBA_2V2: CatalogEntry = {
  id: "escoba-de-15-2v2",
  gameFamily: "escoba",
  section: "cartas",
  displayNameKey: "games.escoba2v2.name",
  seatCount: 4,
  configOptions: [],
};

const CATALOG: readonly CatalogEntry[] = [TRUCO_1V1, TRUCO_2V2, ESCOBA_1V1, ESCOBA_2V2];

const mounted: HTMLElement[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.remove();
});

function mountedContainer(width: number): HTMLElement {
  const container = document.createElement("div");
  container.style.width = `${String(width)}px`;
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

/**
 * Card art (`<img>`) loads asynchronously, and both screens are almost
 * entirely card art. Waiting for the decode explicitly removes that source of
 * flakiness outright rather than leaving it to the screenshot-stability retry
 * budget — the same reason `truco-ui`'s own scenes wait.
 */
async function waitForArt(container: HTMLElement): Promise<void> {
  const images = [...container.querySelectorAll("img")];
  await Promise.all(images.map((img) => img.decode()));
}

function noop(): void {
  // intentionally empty — a scene is looked at, never clicked
}

describe("scene: the lobby with two real games in it", () => {
  it("screen one: truco and escoba side by side, each wearing its own cards", async () => {
    // Headroom over the default 414x896: two full-size game cards plus the
    // header and the credit foot are taller than a phone viewport, and
    // Chromium never paints past the viewport edge.
    await page.viewport(414, 1000);
    const container = mountedContainer(375);

    // The REAL grouping function, not a hand-built family list: a family's
    // identity comes from the explicit `gameFamily` every catalog entry
    // carries, and the art from `familyUiFor` inside `renderGameList`. So
    // escoba's three faces here are the ones the product would really draw —
    // 3 de copa, 7 de ORO centred, 5 de espada, which sum to fifteen and are
    // therefore the game's own name laid out as pictures
    // (`escoba/cartas-insignia-del-lobby`).
    renderGameList(container, groupByFamily(CATALOG), { onOpenGame: noop });
    await waitForArt(container);

    await expect.element(container).toMatchScreenshot("escoba-lobby-two-families");
  });

  it("screen two: the escoba screen you reach after picking it — hero fan, mano a mano / en parejas, 'Partida a 30'", async () => {
    await page.viewport(414, 1200);
    const container = mountedContainer(375);

    // One modality per entry, because escoba has exactly one: `deriveModalities([])`
    // yields the single empty modality `{}`. That is also why no segmented
    // picker appears — a single modality is not a choice, so it is not offered
    // as one.
    //
    // The two entries deliberately take OPPOSITE branches of the zero-counter
    // rule: real people waiting on mano a mano, and the bot CTA promoted for
    // en parejas. Both branches are real states of this screen and a still
    // image is the only place to see them next to each other.
    const presence = new Map<GameId, readonly LobbyDisplayEntry[]>([
      [ESCOBA_1V1.id, [{ modality: {}, waitingCount: 2, promoteBotFallback: false }]],
      [ESCOBA_2V2.id, [{ modality: {}, waitingCount: undefined, promoteBotFallback: true }]],
    ]);

    // `onBack` is PASSED, unlike `game-screen.scene.test.ts`'s truco shots:
    // this is the screen reached by pressing escoba on screen one, so there
    // genuinely is a list to go back to and "Todos los juegos" belongs on it.
    renderGameSelection(container, [ESCOBA_1V1, ESCOBA_2V2], ESCOBA_1V1.gameFamily, presence, {
      onPlayVsPerson: noop,
      onPlayVsBot: noop,
      onBack: noop,
    });
    await waitForArt(container);

    await expect.element(container).toMatchScreenshot("escoba-game-screen");
  });
});
