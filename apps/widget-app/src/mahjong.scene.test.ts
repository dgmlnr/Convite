import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { GameId } from "@hexdev/platform-contract";
import type { LobbyDisplayEntry } from "@hexdev/platform-core";
import { ALL_TILE_FACES, tileId } from "@hexdev/mahjong-tile-ui";
import type { CatalogEntry } from "./bootstrap-data.js";
import type { GameSection } from "./game-sections.js";
import { renderGameList } from "./game-list.js";
import { renderGameSelection } from "./game-screen.js";
import { createGameUiRegistry, matchRenderContextFor } from "./game-ui-registry.js";

/**
 * THE THREE SCREENS THE SOLITAIRE ADDS, rendered so a person can look at them.
 *
 * Scenes, not baselines: nothing here is compared against anything and
 * `pnpm visual:review` rewrites them on every run. They exist because this
 * repository has a written record of SEVEN aesthetic defects found by looking
 * and zero found by tests — and the last one was a gameplay defect wearing an
 * aesthetic costume, a layer step at which two tile outlines touched and five
 * layers read as a flat mosaic, in a game whose only rule is whether a tile
 * can be lifted.
 *
 * THE COMPLETION PANEL IS THE ONE THAT HAS NEVER BEEN SEEN. It shipped a
 * slice ago with its sentences pinned, its determinism fenced on `outerHTML`
 * and its accessible name asserted — and no scene, because until this slice
 * no player could reach it. It is also the first screen this game shows that
 * is made of words rather than of tiles, so nothing about the board's own
 * verdict transfers to it.
 */

const LAYOUT_ATTRIBUTE = "data-hexdev-layout";
const SOLO = "mahjong-solitario" as GameId;
const SOLO_PLAYER = "mahjong-scene-player";

const SOLO_ENTRY: CatalogEntry = {
  id: SOLO,
  gameFamily: "mahjong-solitario",
  section: "fichas",
  displayNameKey: "games.mahjongSolitario.name",
  seatCount: 1,
  configOptions: [],
};

/** Nobody is ever waiting for a one-seat game, so this is the ONLY presence
 * shape this card is ever rendered from — the same one that makes the bot CTA
 * prominent on every other game in the catalog. */
const SOLO_PRESENCE = new Map<GameId, readonly LobbyDisplayEntry[]>([[SOLO, [{ modality: {}, waitingCount: undefined, promoteBotFallback: true }]]]);

const mounted: HTMLElement[] = [];

afterEach(async () => {
  while (mounted.length > 0) mounted.pop()!.remove();
  document.documentElement.removeAttribute(LAYOUT_ATTRIBUTE);
  await page.viewport(414, 896);
});

function mountedContainer(width: number): HTMLElement {
  const container = document.createElement("div");
  container.style.width = `${String(width)}px`;
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

/** The match box as `enterMatch` leaves it: fullscreen, pinned to the
 * viewport, nothing else on screen. Rendered through the REGISTRY rather than
 * by calling the panel directly, so what is in the picture is what a player
 * gets. */
async function matchScreen(outcome: { readonly winnerIds: readonly string[] }, tiles: readonly (string | null)[]): Promise<HTMLElement> {
  await page.viewport(844, 390);
  document.documentElement.setAttribute(LAYOUT_ATTRIBUTE, "fullscreen");
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
  document.body.appendChild(container);
  mounted.push(container);

  // 1 000 ms to 273 000 ms — four minutes and thirty-two seconds of board, so
  // the figure in the picture is the same one on every run.
  const readings = [1_000, 273_000];
  let index = 0;
  const render = createGameUiRegistry()
    .get(SOLO)!
    .createRenderer(matchRenderContextFor("joined", () => readings[Math.min(index++, readings.length - 1)]!));

  render(container, { view: { playerId: SOLO_PLAYER, tiles }, legalActions: [], outcome }, () => {}, () => {}, () => {});
  await Promise.all([...container.querySelectorAll("img")].map((image) => image.decode()));
  return container;
}

/** Enough tiles to have a board under the panel, laid into the first
 * positions of the layout. Not a real deal — the subject is the panel, and a
 * generated turtle would only make the picture harder to read a sentence off. */
const SOME_TILES: readonly (string | null)[] = Array.from({ length: 40 }, (_, index) => (index % 3 === 0 ? "5-circles" : index % 3 === 1 ? "wind-east" : "dragon-red"));

/**
 * A FULL WALL, in the shape a deal produces: four of every ordinary face and
 * one of each bonus tile, 144 in all.
 *
 * Built from the ART package's own face list rather than from the engine's,
 * because this tier holds the artwork and not the rules — and the two agreeing
 * is a fact `mahjong-solitaire-ui`'s `art-agreement.test.ts` already fences, so
 * it does not need re-proving in a picture.
 */
const FULL_WALL: readonly string[] = [
  ...ALL_TILE_FACES.filter((tile) => tile.kind !== "flower" && tile.kind !== "season").flatMap((tile) => [tile, tile, tile, tile]),
  ...ALL_TILE_FACES.filter((tile) => tile.kind === "flower" || tile.kind === "season"),
].map((tile) => tileId(tile));

/** Two positions on the base layer's outer edge — free by construction on a
 * full board, and far enough apart that the picture shows one lit tile rather
 * than a lit pair. */
const A_FREE_PAIR = [{ type: "remove-pair", playerId: SOLO_PLAYER, a: 0, b: 11 }];

describe("scene: the screen that ends the match", () => {
  it("cleared — the sentence, the figure, and the empty felt a finished board leaves", async () => {
    // A cleared board really is empty: every tile came off, so the panel sits
    // on the felt with nothing behind it. That is the picture, not a
    // simplification of one.
    const container = await matchScreen({ winnerIds: [SOLO_PLAYER] }, []);
    await expect.element(container).toMatchScreenshot("mahjong-match-cleared");
  });

  it("deadlocked — the other ending, over the board that caused it", async () => {
    const container = await matchScreen({ winnerIds: [] }, SOME_TILES);
    await expect.element(container).toMatchScreenshot("mahjong-match-deadlocked");
  });
});

/**
 * THE GAME BEING PLAYED, which is the one picture none of the fences can
 * produce: a real wall on the real board, drawn by the real registry entry,
 * with one tile pressed and waiting for its partner.
 *
 * The press is a REAL `pointerdown` at the tile's own centre, routed through
 * `elementFromPoint` and `resolvePress` exactly as a finger is, rather than a
 * `data-selected` attribute set by hand — a scene of a state nothing can reach
 * is a picture of nothing.
 */
describe("scene: the board mid-game, with half a move made", () => {
  it("a rotated phone, fullscreen — the tile that has been pressed once, at the width it is pressed at", async () => {
    await page.viewport(844, 390);
    document.documentElement.setAttribute(LAYOUT_ATTRIBUTE, "fullscreen");
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.inset = "0";
    document.body.appendChild(container);
    mounted.push(container);

    const render = createGameUiRegistry().get(SOLO)!.createRenderer(matchRenderContextFor("joined", () => 0));
    render(container, { view: { playerId: SOLO_PLAYER, tiles: FULL_WALL }, legalActions: A_FREE_PAIR }, () => {});
    await Promise.all([...container.querySelectorAll("img")].map((image) => image.decode()));

    const tile = container.querySelector<HTMLElement>('[data-position="0"]')!;
    const box = tile.getBoundingClientRect();
    tile.dispatchEvent(new PointerEvent("pointerdown", { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, bubbles: true }));

    await expect.element(container).toMatchScreenshot("mahjong-match-in-play");
  });
});

/**
 * SCREEN ONE, AS A REAL TENANT NOW GETS IT — two shelves, both named, with
 * the solitaire's title-only card beside two card games that have art.
 *
 * That contrast is the thing to look at and the reason this scene exists.
 * `game-list.ts` already answers the empty-art case ("a game with no art yet
 * is a game, not a hole in the list") and the answer was written when no game
 * had ever taken it; the solitaire is the first that does, permanently,
 * because its 42 faces are transparent symbols with no tile body behind them
 * and a lobby card takes image URLs rather than markup.
 */
describe("scene: the front door, with the shelf the solitaire put on it", () => {
  const cartaEntry = (id: string, family: string, key: string, seatCount = 2): CatalogEntry => ({
    id: id as GameId,
    gameFamily: family,
    section: "cartas",
    displayNameKey: key,
    seatCount,
    configOptions: [],
  });
  const SHELVES: readonly GameSection[] = [
    {
      id: "cartas",
      families: [
        { id: "truco", entries: [cartaEntry("truco-argentino", "truco", "games.truco.name"), cartaEntry("truco-argentino-2v2", "truco", "games.truco2v2.name", 4)] },
        { id: "escoba", entries: [cartaEntry("escoba-de-15", "escoba", "games.escoba.name")] },
      ],
    },
    { id: "fichas", families: [{ id: "mahjong-solitario", entries: [SOLO_ENTRY] }] },
  ];

  it("wide (1024px): a shelf of card games and a shelf of tiles", async () => {
    await page.viewport(1024 + 120, 1000);
    const container = mountedContainer(1024);
    renderGameList(container, SHELVES, { onOpenGame: () => {} });
    await expect.element(container).toMatchScreenshot("mahjong-front-door-wide");
  });

  it("narrow (375px): the shelves stack, and the title-only card holds its own", async () => {
    await page.viewport(414, 1200);
    const container = mountedContainer(375);
    renderGameList(container, SHELVES, { onOpenGame: () => {} });
    await expect.element(container).toMatchScreenshot("mahjong-front-door-narrow");
  });
});

describe("scene: the solitaire's own screen two", () => {
  it("one seat, so one control and no opponent anywhere on the card", async () => {
    await page.viewport(414, 896);
    const container = mountedContainer(375);
    renderGameSelection(container, [SOLO_ENTRY], SOLO_ENTRY.gameFamily, SOLO_PRESENCE, { onPlayVsPerson: () => {}, onPlayVsBot: () => {} });
    await expect.element(container).toMatchScreenshot("mahjong-game-screen-narrow");
  });

  it("wide — the same card with room, beside the shelf it sits on", async () => {
    await page.viewport(1024 + 120, 900);
    const container = mountedContainer(1024);
    renderGameSelection(container, [SOLO_ENTRY], SOLO_ENTRY.gameFamily, SOLO_PRESENCE, { onPlayVsPerson: () => {}, onPlayVsBot: () => {} });
    await expect.element(container).toMatchScreenshot("mahjong-game-screen-wide");
  });
});
