/// <reference types="@vitest/browser/matchers" />
import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { ALL_TILES, layBoard, tileId } from "@hexdev/mahjong-solitaire-engine";
import type { PlayerId } from "@hexdev/mahjong-solitaire-engine";
import { ALL_TILE_FACES, getTileArt, tileBodySvg } from "@hexdev/mahjong-tile-ui";
import { ensureBoardStyles } from "./board-styles.js";
import { createMahjongBoardRenderer } from "./board.js";

/**
 * THE SCREENS SOMEBODY HAS TO LOOK AT — rendered on demand by
 * `pnpm visual:review`, never committed, never compared.
 *
 * This repository has a written record of six aesthetic defects found by
 * looking and zero found by tests, and the last visible slice found two more
 * AFTER every geometry assertion passed, because the broken relationship was
 * between sibling groups and nothing was looking there. So the geometry fences
 * next door say the board fits and the tile is 31.7px wide; they cannot say
 * whether it reads.
 *
 * TWO VERDICTS HERE ARE NON-AUTOMATABLE BY DECREE, not by laziness:
 *
 * 1. LEGIBILITY at the binding width (spec Domain E). The change carried a
 *    "rank illegible at 24px" finding for six slices that was measured with
 *    SPANISH PLAYING CARDS, whose small corner indices are a property of that
 *    deck; a mahjong tile has no index and its whole face is the symbol, so
 *    that conclusion does not transfer and the spec forbids dressing this up
 *    with a proxy assertion. The first two scenes are where it gets answered.
 *
 * 2. THE FACE-TO-NAME MAPPING. Slice 6 measured that swapping the west and
 *    south wind files passes every fence in the repository — keys, values,
 *    distinctness, both-ways, the on-disk audit — because nothing here knows
 *    that 西 means west. `mahjong-faces` is the only artefact that can catch
 *    it: every drawing beside the Spanish name this codebase gives it.
 */

const PLAYER = "mahjong-scene-player" as unknown as PlayerId;
const LAYOUT_ATTRIBUTE = "data-hexdev-layout";

const mounted: HTMLElement[] = [];

afterEach(async () => {
  while (mounted.length > 0) mounted.pop()!.remove();
  document.documentElement.removeAttribute(LAYOUT_ATTRIBUTE);
  await page.viewport(414, 896);
});

async function fullscreenBoard(w: number, h: number): Promise<HTMLElement> {
  await page.viewport(w, h);
  document.documentElement.setAttribute(LAYOUT_ATTRIBUTE, "fullscreen");
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
  document.body.appendChild(container);
  mounted.push(container);
  createMahjongBoardRenderer()(container, layBoard(PLAYER, ALL_TILES.map((tile) => tileId(tile))).tiles);
  await Promise.all([...container.querySelectorAll("img")].map((image) => image.decode()));
  return container;
}

describe("scene: the turtle on the felt", () => {
  it("a rotated phone, fullscreen — the width the legibility verdict is taken at", async () => {
    const container = await fullscreenBoard(844, 390);
    await expect.element(container).toMatchScreenshot("mahjong-turtle-phone-landscape");
  });

  it("a laptop window — the largest tile this board is ever allowed to draw", async () => {
    // 1400x900 is the widest container the render measurement reached, and the
    // cap (72px) is what decides here rather than either budget. The artwork
    // at its biggest, which is where a bevel or a raster that is too small
    // would show first.
    const container = await fullscreenBoard(1400, 900);
    await expect.element(container).toMatchScreenshot("mahjong-turtle-desktop");
  });
});

describe("scene: the 42 drawings, each beside the name this codebase gives it", () => {
  it("every face, labelled — the only check a wrong hanzi mapping cannot pass", async () => {
    await page.viewport(1240, 780);
    const gallery = document.createElement("div");
    ensureBoardStyles(document);
    gallery.className = "hexdev-mahjong-board";
    gallery.style.display = "grid";
    gallery.style.gridTemplateColumns = "repeat(11, 1fr)";
    gallery.style.gap = "10px 8px";
    gallery.style.rowGap = "34px";
    document.body.appendChild(gallery);
    mounted.push(gallery);

    for (const face of ALL_TILE_FACES) {
      const art = getTileArt(face);
      const cell = document.createElement("figure");
      cell.style.margin = "0";
      cell.style.position = "relative";
      cell.style.width = "94px";
      cell.style.height = `${String(94 / 0.69882)}px`;

      const body = document.createElement("div");
      body.style.position = "absolute";
      body.style.inset = "0";
      body.innerHTML = tileBodySvg();
      cell.appendChild(body);

      const image = document.createElement("img");
      image.src = art.src;
      image.alt = art.alt;
      image.style.position = "absolute";
      image.style.inset = "0";
      image.style.width = "100%";
      image.style.height = "100%";
      cell.appendChild(image);

      const caption = document.createElement("figcaption");
      caption.textContent = art.alt;
      caption.style.position = "absolute";
      caption.style.top = "100%";
      caption.style.width = "100%";
      caption.style.textAlign = "center";
      caption.style.font = "12px/1.4 var(--gx-font-family, system-ui, sans-serif)";
      caption.style.color = "#f4efe4";
      cell.appendChild(caption);

      gallery.appendChild(cell);
    }

    await Promise.all([...gallery.querySelectorAll("img")].map((image) => image.decode()));
    await expect.element(gallery).toMatchScreenshot("mahjong-faces");
  });
});
