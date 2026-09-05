import { afterEach, describe, expect, it } from "vitest";
import { tileBodySvg } from "@hexdev/mahjong-tile-ui";
import { MAHJONG_CARD_ART } from "./card-art.js";

/**
 * THE LOBBY'S OWN TILES, drawn without a board underneath them — the other
 * half of `board.browser.test.ts`'s own fence on `drawTile()`. That file
 * proves a tile ON THE BOARD gets a bone and a face; this proves the SAME
 * bone-drawing call, reused for a tile that is never placed on one.
 */

const mounted: HTMLElement[] = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.remove();
});

function mount(element: HTMLElement): HTMLElement {
  document.body.appendChild(element);
  mounted.push(element);
  return element;
}

describe("MAHJONG_CARD_ART — the lobby's own three tiles", () => {
  it("is three tiles, the same count truco's and escoba's own card fans use", () => {
    expect(MAHJONG_CARD_ART.length).toBe(3);
  });

  it("draws its bone with the EXACT SAME markup the board draws with — tileBodySvg(), not a second SVG", () => {
    const tile = mount(MAHJONG_CARD_ART[0]!.render(document));

    const body = tile.querySelector(".hexdev-mahjong-card-tile-body");
    expect(body, "fence setup: the bone wrapper must exist for its markup to mean anything").not.toBeNull();
    // Compared against a FRESH call to the same function, round-tripped
    // through the SAME innerHTML parse/serialize the composed tile itself
    // went through — a raw string comparison against tileBodySvg()'s own
    // return value fails on self-closing tags alone: the DOM re-serializes
    // `<rect .../>` as `<rect ...></rect>`, so what to compare against is a
    // second element built the identical way, not the source string.
    const reference = document.createElement("div");
    reference.innerHTML = tileBodySvg();
    expect(body!.innerHTML).toBe(reference.innerHTML);
  });

  it("draws a real face image on top of the bone, never a glyph with nothing under it", () => {
    const tile = mount(MAHJONG_CARD_ART[1]!.render(document));

    const face = tile.querySelector<HTMLImageElement>(".hexdev-mahjong-card-tile-face");
    expect(face, "the symbol on top of the bone").not.toBeNull();
    expect(face!.tagName).toBe("IMG");
    expect(face!.src, "a real tile asset, not an empty or placeholder src").toContain(".webp");
  });

  it("hides no state in a shared node — two calls to the same slot's render() produce two independent elements", () => {
    const first = MAHJONG_CARD_ART[0]!.render(document);
    const second = MAHJONG_CARD_ART[0]!.render(document);

    expect(first, "a factory, not a cached singleton a second card would fight the first over").not.toBe(second);
  });

  it("carries no alt text of its own — the fan that mounts it is aria-hidden, and a third alt would name nothing a player must act on", () => {
    const tile = mount(MAHJONG_CARD_ART[2]!.render(document));

    expect(tile.querySelector("img")?.alt).toBe("");
  });
});
