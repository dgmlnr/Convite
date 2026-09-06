/// <reference types="@vitest/browser/matchers" />
import { page } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { CUP_ART_HEIGHT, CUP_ART_WIDTH, getCupArtUrl } from "./art.js";
import type { DieFace } from "./geometry.js";
import { DIE_FACES } from "./geometry.js";
import { createDiceCup } from "./dice.js";
import { ensureDiceStyles } from "./dice-styles.js";
import { createDieSceneElement } from "./die.js";

/**
 * THE SCREENS SOMEBODY HAS TO LOOK AT — `pnpm visual:review`, never
 * committed, never diffed. `sdd/generala-props/explore` §6 is explicit about
 * why this file exists at all: `pixelmatch` measures colour distance, and
 * WHICH FACE OF A DIE IS SHOWING is a rotation, not a colour — a screenshot
 * diff cannot be trusted to notice a die landed wrong, and the mahjong
 * archive's own headline finding (twelve aesthetic defects found by looking,
 * zero by any test) is the direct precedent for why a "quality" cup and dice
 * need a human's eye, not another assertion.
 *
 * Animations are globally disabled while any scene renders
 * (`visual/setup.ts`, inherited via `vitest.scenes.config.ts`'s `mergeConfig`
 * with the visual project) — which is exactly right here: every die below is
 * captured already AT REST, in the pose `FACE_ROTATION` commits to, which is
 * precisely the thing a reviewer needs to see clearly to judge "is that
 * really a 5".
 */

const mounted: HTMLElement[] = [];
afterEach(async () => {
  while (mounted.length > 0) mounted.pop()!.remove();
  await page.viewport(414, 896);
});

describe("scene: a decided roll, cup and all", () => {
  it("a phone-width table — the width most players actually see this on", async () => {
    await page.viewport(390, 700);
    const handle = createDiceCup(document, { onPress: () => {} });
    // THE FELT, the identical stand-in colour `dice-all-faces` below already
    // uses for it — a real board (none exists yet, `index.ts`'s own scope
    // note) owns the actual `var(--gx-color-primary, …)` bridge, exactly the
    // boundary `mahjong-tile-ui`'s own scene tests draw for themselves; this
    // package only ever demos on SOMETHING that is not the bare white page a
    // "quality cubilete" review found the piece sitting on before the SVG
    // cup was replaced by the Blender render (`art.ts`'s own header).
    handle.element.style.background = "#14231d";
    document.body.appendChild(handle.element);
    mounted.push(handle.element);
    handle.roll([3, 5, 5, 2, 6]);
    await expect.element(handle.element).toMatchScreenshot("dice-cup-roll-phone");
  });

  it("a wide desktop table — the cup's own artwork at its most visible size", async () => {
    await page.viewport(1280, 800);
    const handle = createDiceCup(document, { onPress: () => {} });
    handle.element.style.background = "#14231d";
    document.body.appendChild(handle.element);
    mounted.push(handle.element);
    handle.roll([1, 4, 6, 2, 3]);
    await expect.element(handle.element).toMatchScreenshot("dice-cup-roll-desktop");
  });
});

describe("scene: the cup alone, at a size where the leather and the felt are not a guess", () => {
  /**
   * ITS OWN CLOSE-UP, the same reason `dice-all-faces` below exists for the
   * six dice: "quiero algo de calidad" was an objection about THIS piece
   * specifically, and at the 84×99 CSS px it renders inside
   * `createDiceCup`'s button, the rim wall and the felt interior are a
   * handful of pixels each — real, but not a size anyone could judge
   * "quality" from. This is the one screen sized so a reviewer can actually
   * see them, at close to the rendered artwork's own intrinsic resolution
   * (`CUP_ART_WIDTH`/`-HEIGHT`) rather than a heavy upscale of it.
   */
  it("a single cup, large — the exact surface a 'quality cubilete' review has to judge", async () => {
    await page.viewport(320, 360);
    ensureDiceStyles(document);
    const wrap = document.createElement("div");
    wrap.className = "hexdev-dice-root";
    wrap.style.display = "flex";
    wrap.style.justifyContent = "center";
    wrap.style.alignItems = "center";
    wrap.style.padding = "24px";
    wrap.style.background = "#14231d";

    const cupArt = document.createElement("img");
    cupArt.src = getCupArtUrl().href;
    cupArt.alt = "";
    cupArt.style.width = "220px";
    cupArt.style.height = `${String((220 * CUP_ART_HEIGHT) / CUP_ART_WIDTH)}px`;
    cupArt.style.display = "block";
    wrap.appendChild(cupArt);

    document.body.appendChild(wrap);
    mounted.push(wrap);
    await expect.element(wrap).toMatchScreenshot("dice-cup-closeup");
  });
});

describe("scene: the six faces, each beside the number it is supposed to be", () => {
  it("every face at rest, large enough to count pips by eye", async () => {
    await page.viewport(900, 320);
    ensureDiceStyles(document);
    const gallery = document.createElement("div");
    // Every var(--dice-…) this gallery's dice read resolves from here — the
    // untenanted defaults `dice-styles.ts` applies to `.hexdev-dice-root`.
    // `createDiceCup` sets this class on its own root automatically; this
    // gallery builds dice directly (no cup), so it opts in the same way a
    // future themed board would.
    gallery.className = "hexdev-dice-root";
    gallery.style.display = "flex";
    gallery.style.gap = "24px";
    gallery.style.padding = "24px";
    gallery.style.background = "#14231d";
    document.body.appendChild(gallery);
    mounted.push(gallery);

    for (const face of DIE_FACES as readonly DieFace[]) {
      const cell = document.createElement("figure");
      cell.style.margin = "0";
      cell.style.width = "110px";

      const scene = createDieSceneElement(document, face, 0);
      (scene.style as CSSStyleDeclaration).width = "110px";
      (scene.style as CSSStyleDeclaration).height = "110px";
      cell.appendChild(scene);

      const caption = document.createElement("figcaption");
      caption.textContent = String(face);
      caption.style.textAlign = "center";
      caption.style.color = "#f4efe4";
      caption.style.font = "16px/1.4 system-ui, sans-serif";
      cell.appendChild(caption);

      gallery.appendChild(cell);
    }

    await expect.element(gallery).toMatchScreenshot("dice-all-faces");
  });
});
