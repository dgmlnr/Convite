import { DIE_BEVEL, DIE_FRAME, DIE_RADIUS, DIE_SIZE, DIE_VIEWBOX } from "./geometry.js";

/**
 * The die's own bone — flat fills, a lit/shaded bevel ring, no pips, no
 * `<defs>` — a straight copy of `mahjong-tile-ui/tile-body.ts`'s
 * `tileBodySvg()` recipe onto a square instead of a tile's rounded
 * rectangle.
 *
 * WHY THE SAME RECIPE RATHER THAN A NEW ONE. `sdd/generala-props/explore`
 * names this verbatim: flat fills need no gradient, a gradient would need a
 * `<defs>`, and this repository already carries the scar of a `<defs>` whose
 * custom properties were scoped to the wrong subtree
 * (`visual/README.md`'s matchstick-scoreboard incident). A second bevel
 * technique invented for dice would be a second thing that could get that
 * wrong; reusing the one already measured and shipped is not laziness, it is
 * the whole point of naming this a REPOSITORY IDIOM rather than a one-off.
 *
 * LIT TOP-LEFT, SHADED BOTTOM-RIGHT — one light source, same as the tile,
 * so a die sitting beside a tile or a card in the same scene reads as lit by
 * the same table lamp rather than by six different ones.
 */
export function dieBodySvg(): string {
  const inset = DIE_FRAME + DIE_BEVEL / 2;
  const radius = Math.max(DIE_RADIUS - inset, 0);
  const far = DIE_SIZE - inset;

  const lit = [
    `M${String(inset)} ${String(far - radius)}`,
    `L${String(inset)} ${String(inset + radius)}`,
    `A${String(radius)} ${String(radius)} 0 0 1 ${String(inset + radius)} ${String(inset)}`,
    `L${String(far - radius)} ${String(inset)}`,
    `A${String(radius)} ${String(radius)} 0 0 1 ${String(far)} ${String(inset + radius)}`,
  ].join(" ");
  const shaded = [
    `M${String(far)} ${String(inset + radius)}`,
    `L${String(far)} ${String(far - radius)}`,
    `A${String(radius)} ${String(radius)} 0 0 1 ${String(far - radius)} ${String(far)}`,
    `L${String(inset + radius)} ${String(far)}`,
    `A${String(radius)} ${String(radius)} 0 0 1 ${String(inset)} ${String(far - radius)}`,
  ].join(" ");

  return [
    `<svg viewBox="${DIE_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">`,
    `<rect x="0" y="0" width="${String(DIE_SIZE)}" height="${String(DIE_SIZE)}" rx="${String(DIE_RADIUS)}" fill="var(--dice-face)" stroke="var(--dice-edge)" stroke-width="1" />`,
    `<path d="${lit}" fill="none" stroke="var(--dice-bevel-light)" stroke-width="${String(DIE_BEVEL)}" stroke-linecap="round" />`,
    `<path d="${shaded}" fill="none" stroke="var(--dice-bevel-shade)" stroke-width="${String(DIE_BEVEL)}" stroke-linecap="round" />`,
    `</svg>`,
  ].join("");
}
