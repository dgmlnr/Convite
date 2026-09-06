import type { DieFace } from "./geometry.js";
import { DIE_VIEWBOX, FACE_PIP_SLOTS, PIP_RADIUS, PIP_SLOTS } from "./geometry.js";

/**
 * A face's pips, generated from `FACE_PIP_SLOTS`' index list rather than six
 * hand-drawn layouts. A functional mark — plain circles — needs no separate
 * creative authorship to license, which is the whole reason this package
 * ships no `assets/` directory at all (`sdd/generala-props/explore` §5):
 * unlike the tile's hanzi glyphs or the deck's illustrated suits, there is no
 * artwork here for a raster to BE, so there is nothing to attribute.
 *
 * ONE TOKEN FOR EVERY PIP ON EVERY FACE, deliberately: a real die does not
 * shade its one-pip face differently from its six-pip face, and painting all
 * of them from `--dice-pip` is what keeps that true here too.
 *
 * A REAL `<svg>` ROOT, NOT BARE `<circle>` ELEMENTS — measured to matter, not
 * a style preference: `die-face.ts` mounts this string via `innerHTML` on an
 * ordinary HTML `<div>`, and an HTML parser reads an unwrapped `<circle>`
 * there as an unrecognised HTML element (the SVG namespace only applies
 * inside an `<svg>` subtree), which renders as nothing at all. A first
 * version of this function returned bare circles and every rolled die came
 * up blank — the body showed, the pips silently did not, on every face,
 * caught only by looking at the rendered scene (`dice.scene.test.ts`),
 * exactly the class of defect `sdd/generala-props/explore` names `pixelmatch`
 * as unable to catch reliably and a person can.
 */
export function diePipsSvg(face: DieFace): string {
  const circles = FACE_PIP_SLOTS[face]
    .map((slot) => {
      const [cx, cy] = PIP_SLOTS[slot]!;
      return `<circle cx="${String(cx)}" cy="${String(cy)}" r="${String(PIP_RADIUS)}" fill="var(--dice-pip)" />`;
    })
    .join("");
  return `<svg viewBox="${DIE_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">${circles}</svg>`;
}
