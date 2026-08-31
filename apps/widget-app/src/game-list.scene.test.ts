import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { GameId } from "@hexdev/platform-contract";
import { renderGameList } from "./game-list.js";
import type { GameFamily } from "./game-families.js";
import type { GameSection } from "./game-sections.js";
import type { CatalogEntry } from "./bootstrap-data.js";

/**
 * SCREEN ONE, rendered so a person can look at it.
 *
 * These are scenes, not baselines: nothing here is compared against anything,
 * and `pnpm visual:review` rewrites them on every run. The paragraph that
 * stood here said this screen "renders for nobody in the running product
 * until a second game ships" — escoba shipped, both roots entitle four ids
 * that collapse into two families, and this is now the first thing a player
 * sees. The scenes matter more, not less: a heading, a background and a row
 * that overflows are exactly what a `getBoundingClientRect()` assertion is
 * blind to, and this is the only screen in the package where somebody has to
 * look before it goes out.
 */
const entry = (id: string, gameFamily: string, key: string, seatCount = 2, section = "cartas"): CatalogEntry => ({
  id: id as GameId,
  gameFamily,
  section,
  displayNameKey: key,
  seatCount,
  configOptions: [],
});

const TRUCO: GameFamily = {
  id: "truco",
  entries: [entry("truco-argentino", "truco", "games.truco.name"), entry("truco-argentino-2v2", "truco", "games.truco2v2.name", 4)],
};
/**
 * A family with no declared art — what a game looks like the day it lands in
 * the catalog and before its faces are chosen.
 *
 * It BORROWS truco's display name on purpose. The subject here is the empty
 * art slot, and inventing a string for a game that does not exist yet would
 * put dead copy in `i18n.ts` to make a scene read nicely. An untranslated key
 * rendered raw would look like a defect instead of like the thing being
 * shown.
 */
const SIN_ARTE: GameFamily = { id: "escoba", entries: [entry("escoba-de-15", "escoba", "games.truco.name")] };

/** ONE SHELF is what every configured tenant produces today — all four
 * registered modules declare `section: "cartas"` — so this is the render the
 * three scenes below are of, and it is the pre-shelf screen unchanged. */
const oneSection = (families: readonly GameFamily[]): readonly GameSection[] => [{ id: "cartas", families }];

/** TWO SHELVES, the second of them named by an id `SECTIONS` has no copy for,
 * so its heading renders raw — deliberately, because that is what a shelf
 * added to the catalog before its Spanish name lands really looks like, and
 * the point of a scene is to see it before a player does.
 *
 * IT USED TO BE `"fichas"`, and slice 9 gave that shelf its name, which
 * quietly turned this scene into a picture of the ordinary case and left the
 * paragraph above saying the opposite of what rendered. Moved to an id
 * nothing declares, which is what the scene was always about; the real two
 * shelves a tenant gets today are in `mahjong.scene.test.ts`. */
const DOS_ESTANTES: readonly GameSection[] = [
  { id: "cartas", families: [TRUCO, SIN_ARTE] },
  { id: "dados", families: [{ id: "sin-copia", entries: [entry("sin-copia-game", "sin-copia", "games.escoba.name", 2, "dados")] }] },
];

const mounted: HTMLElement[] = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
});

function mountedContainer(width: number): HTMLElement {
  const container = document.createElement("div");
  container.style.width = `${width}px`;
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

const noop = (): void => {};

describe("scene: the game list (screen one)", () => {
  it("two games, wide (1024px): the shape this screen exists for", async () => {
    await page.viewport(1024 + 120, 900);
    const container = mountedContainer(1024);
    renderGameList(container, oneSection([TRUCO, SIN_ARTE]), { onOpenGame: noop });
    await expect.element(container).toMatchScreenshot("game-list-two-wide");
  });

  it("two games, narrow (375px): one column, the art still a hand", async () => {
    const container = mountedContainer(375);
    renderGameList(container, oneSection([TRUCO, SIN_ARTE]), { onOpenGame: noop });
    await expect.element(container).toMatchScreenshot("game-list-two-narrow");
  });

  it("one game with no art at all: a card, never a hole", async () => {
    const container = mountedContainer(375);
    renderGameList(container, oneSection([SIN_ARTE]), { onOpenGame: noop });
    await expect.element(container).toMatchScreenshot("game-list-no-art");
  });
});

/**
 * TWO SHELVES, WHICH IS THE ONLY PART OF THIS SLICE A PLAYER COULD SEE.
 *
 * The measurements next door prove the title shares its band and the cards
 * stay inside it. None of them can say whether the label reads as a label,
 * whether the gap between shelves groups anything, or whether a raw section
 * id looks like a defect or like a name. That is what these two are for.
 */
describe("scene: two shelves on the front door", () => {
  it("wide (1024px): two headed groups, the second one with no Spanish name yet", async () => {
    await page.viewport(1024 + 120, 1000);
    const container = mountedContainer(1024);
    renderGameList(container, DOS_ESTANTES, { onOpenGame: noop });
    await expect.element(container).toMatchScreenshot("game-list-dos-estantes-wide");
  });

  it("narrow (375px): the shelves stack, and the labels still lead their own column", async () => {
    await page.viewport(414, 1200);
    const container = mountedContainer(375);
    renderGameList(container, DOS_ESTANTES, { onOpenGame: noop });
    await expect.element(container).toMatchScreenshot("game-list-dos-estantes-narrow");
  });
});
