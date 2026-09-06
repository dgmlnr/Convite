import { getDieFaceArt } from "./art.js";
import type { DieFace } from "./geometry.js";
import { DIE_SIDE_FACE, DIE_SIDE_LOCAL_TRANSFORM, DIE_SIDE_ORDER, restingPoseDeclaration } from "./geometry.js";

/**
 * One die, assembled as a real six-sided cube and posed at rest — never a
 * flat face swapped in after a spin.
 *
 * WRITE ORDER IS THE WHOLE CONTRACT. `restingPoseDeclaration(face)` is set
 * on `cube.style` in this same synchronous call, before `cube` is ever
 * appended to `scene` and long before `scene` is handed back to a caller who
 * might append it to a live document. There is no `requestAnimationFrame`,
 * no timeout, no later "now reveal the result" step — the element the
 * browser paints for the very first time already carries the true pose,
 * because nothing in this function can run a second time to change it.
 * `resting-pose-write-order.browser.test.ts` proves this by reading the
 * style attribute back the instant `createDieSceneElement` returns, with no
 * animation frame awaited.
 *
 * THE SIX FACELETS ARE STATIC CONTENT. `DIE_SIDE_FACE`/`DIE_SIDE_LOCAL_
 * TRANSFORM` never depend on which face was rolled — a physical die's six
 * numbers do not change identity when it lands differently, only its
 * ORIENTATION does, and that is exactly what `--dice-rest-x`/`-y` alone
 * carry.
 *
 * THE TILT WRAPPER CARRIES NO FACE, NO STYLE, NO WRITE OF ITS OWN. Between
 * `scene` and `cube` this now inserts one plain `<div class="hexdev-dice-
 * tilt">` — a STATIC class, not a data attribute, because the small camera
 * tilt it applies (`DIE_REST_TILT`, `geometry.ts`) is the same for a 1 as
 * for a 6 and needs no per-roll computation at all. It exists purely so
 * that tilt composes AROUND the cube's own, arbitrarily large,
 * already-decided rotation rather than being added into the same two
 * numbers — see `DIE_REST_TILT`'s own comment for the two-face "V" that
 * happened the one time this was tried the other way.
 */
export function createDieSceneElement(doc: Document, face: DieFace, index: number): HTMLElement {
  const scene = doc.createElement("div");
  scene.className = "hexdev-dice-scene";

  const tilt = doc.createElement("div");
  tilt.className = "hexdev-dice-tilt";

  const cube = doc.createElement("div");
  cube.className = "hexdev-dice-cube";
  cube.dataset.face = String(face);
  // The resting pose AND the stagger index, in one write, before this
  // element has any children or any parent.
  cube.style.cssText = `${restingPoseDeclaration(face)} --i: ${String(index)};`;

  for (const side of DIE_SIDE_ORDER) {
    const facelet = doc.createElement("div");
    facelet.className = "hexdev-dice-face";
    facelet.dataset.side = side;
    facelet.style.transform = DIE_SIDE_LOCAL_TRANSFORM[side];
    // A rendered WebP, not an inline `<svg>` — see `art.ts`'s own header
    // for why the flat vector body/pips this used to mount are gone
    // entirely, not merely restyled: the product owner rejected that art
    // outright, and a raster face needs no in-document markup to draw,
    // only a URL.
    const art = getDieFaceArt(DIE_SIDE_FACE[side]);
    const img = doc.createElement("img");
    img.src = art.src;
    img.width = art.width;
    img.height = art.height;
    img.alt = "";
    // Decorative: the facelet's OWN number is never the information a
    // player reads — `dice-announcer.ts`'s live region already speaks the
    // whole roll in one sentence, and a screen reader stepping through six
    // per-die alt texts (five of which are never the decided face at all,
    // since a cube ships all six numbers permanently) would be noise, not
    // help.
    facelet.appendChild(img);
    cube.appendChild(facelet);
  }

  tilt.appendChild(cube);
  scene.appendChild(tilt);
  return scene;
}
