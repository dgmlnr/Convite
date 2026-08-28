import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { GameId } from "@hexdev/platform-contract";
import { renderGameList } from "./game-list.js";
import type { GameFamily } from "./game-families.js";
import type { CatalogEntry } from "./bootstrap-data.js";

/**
 * SCREEN ONE, rendered so a person can look at it.
 *
 * These are scenes, not baselines: nothing here is compared against anything,
 * and `pnpm visual:review` rewrites them on every run. This screen needs them
 * more than most — a tenant entitled to one game opens straight onto that
 * game, and the only configured tenant today has exactly one. So this screen
 * renders for nobody in the running product until a second game ships, and
 * looking at it is the only way to see it at all.
 */
const entry = (id: string, gameFamily: string, key: string, seatCount = 2): CatalogEntry => ({
  id: id as GameId,
  gameFamily,
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
    renderGameList(container, [TRUCO, SIN_ARTE], { onOpenGame: noop });
    await expect.element(container).toMatchScreenshot("game-list-two-wide");
  });

  it("two games, narrow (375px): one column, the art still a hand", async () => {
    const container = mountedContainer(375);
    renderGameList(container, [TRUCO, SIN_ARTE], { onOpenGame: noop });
    await expect.element(container).toMatchScreenshot("game-list-two-narrow");
  });

  it("one game with no art at all: a card, never a hole", async () => {
    const container = mountedContainer(375);
    renderGameList(container, [SIN_ARTE], { onOpenGame: noop });
    await expect.element(container).toMatchScreenshot("game-list-no-art");
  });
});
