import { CUP_BEVEL, CUP_FRAME, CUP_HEIGHT, CUP_RIM_INSET, CUP_VIEWBOX, CUP_WIDTH } from "./geometry.js";

/**
 * The cup's own body: the same flat-fill, lit/shaded-bevel, no-`<defs>`
 * recipe `die-body.ts` and `mahjong-tile-ui/tile-body.ts` already use, drawn
 * on a TRAPEZOID instead of a rounded rectangle — narrower rim, wider base —
 * because a plain box is what the request explicitly did not ask for
 * ("cubilete", not "die-shaped die holder";
 * `sdd/generala-props/explore` §2).
 *
 * STRAIGHT LINES, NO ROUNDED CORNERS. A tile's corner radius reads correctly
 * at 30-70px because that is the whole tile; a cup drawn that small on a
 * phone would lose a rounded corner to a couple of anti-aliased pixels while
 * still paying the arc-math cost. The bevel ring is what has to read at that
 * size, not the silhouette's corners.
 */
export function cupBodySvg(): string {
  const inset = CUP_FRAME + CUP_BEVEL / 2;
  const top = 0;
  const bottom = CUP_HEIGHT;
  const rimLeft = CUP_RIM_INSET;
  const rimRight = CUP_WIDTH - CUP_RIM_INSET;

  const insetTop = inset;
  const insetBottom = CUP_HEIGHT - inset;
  const insetRimLeft = rimLeft + inset;
  const insetRimRight = rimRight - inset;
  const insetBaseLeft = inset;
  const insetBaseRight = CUP_WIDTH - inset;

  // Lit: the rim plus the left (taller, more visible) slanted side.
  const lit = [
    `M${String(insetBaseLeft)} ${String(insetBottom)}`,
    `L${String(insetRimLeft)} ${String(insetTop)}`,
    `L${String(insetRimRight)} ${String(insetTop)}`,
  ].join(" ");
  // Shaded: the right slanted side plus the base.
  const shaded = [
    `M${String(insetRimRight)} ${String(insetTop)}`,
    `L${String(insetBaseRight)} ${String(insetBottom)}`,
    `L${String(insetBaseLeft)} ${String(insetBottom)}`,
  ].join(" ");

  // The rim's own opening: an ellipse rather than the flat top edge left
  // bare. A trapezoid with a straight top reads as a bucket seen from the
  // side; a real cup's mouth is round, and drawing that opening — inset
  // from the rim, shaded, so it reads as looking down into the cup rather
  // than at a lid — is what the first render of this shape was measured to
  // be missing (`pnpm visual:review`, looked at, not asserted: see
  // `dice.scene.test.ts`). Flat fill, no gradient, same rule as everywhere
  // else in this file.
  const rimCenterX = CUP_WIDTH / 2;
  const rimRadiusX = (insetRimRight - insetRimLeft) / 2;
  const rimRadiusY = CUP_BEVEL;

  return [
    `<svg viewBox="${CUP_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">`,
    `<polygon points="${String(rimLeft)},${String(top)} ${String(rimRight)},${String(top)} ${String(CUP_WIDTH)},${String(bottom)} 0,${String(bottom)}" fill="var(--dice-cup-face)" stroke="var(--dice-cup-edge)" stroke-width="1" stroke-linejoin="round" />`,
    `<path d="${lit}" fill="none" stroke="var(--dice-cup-bevel-light)" stroke-width="${String(CUP_BEVEL)}" stroke-linecap="round" stroke-linejoin="round" />`,
    `<path d="${shaded}" fill="none" stroke="var(--dice-cup-bevel-shade)" stroke-width="${String(CUP_BEVEL)}" stroke-linecap="round" stroke-linejoin="round" />`,
    `<ellipse cx="${String(rimCenterX)}" cy="${String(insetTop)}" rx="${String(rimRadiusX)}" ry="${String(rimRadiusY)}" fill="var(--dice-cup-bevel-shade)" stroke="var(--dice-cup-edge)" stroke-width="1" />`,
    `</svg>`,
  ].join("");
}
