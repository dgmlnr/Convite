import {
  CUP_BEVEL,
  CUP_FRAME,
  CUP_HEIGHT,
  CUP_RIM_DEPTH,
  CUP_RIM_INSET,
  CUP_RIM_WALL,
  CUP_VIEWBOX,
  CUP_WIDTH,
} from "./geometry.js";

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
 *
 * SECOND PASS: THE OWNER'S OBJECTION WAS "no wall, no material, no looking
 * in". A single ellipse at the rim reads as a lid because a lid is exactly
 * what one flat ellipse over an opening draws. What is actually missing is
 * the thing a real mouth has and a lid does not: a THICKNESS to the rim
 * (`CUP_RIM_WALL`, drawn as the ring between an outer and an inner ellipse,
 * lit like a worn edge) and, past that ring, a HOLLOW — split into a far
 * half that catches the scene's own top-left light and a near half that
 * cannot, the identical lit/shaded-halves logic the body already uses for
 * its two slanted sides, just closed into two half-ellipses instead of two
 * open strokes. Neither half is a gradient; both are flat fills, so this
 * still needs no `<defs>` (`die-body.ts`'s own scar tissue on that point).
 *
 * THE THREE SEAMS are the material cue: a die's bone is one solid piece with
 * no visible seams, but a real cubilete — leather stitched over a form, or
 * staves banded into a barrel — is not, and a perfectly smooth trapezoid
 * reads as neither. Flat strokes, tapered toward the narrower rim the same
 * way the silhouette itself already is, so they sit obviously ON the
 * surface rather than floating as a separate flat shape in front of it.
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

  // The rim's OUTER ellipse: the wall's top surface, not the opening itself
  // — lit, because a worn lip is lighter than the body it caps, the same
  // "-light" reasoning the two side bevels already carry.
  const rimCenterX = CUP_WIDTH / 2;
  const rimRadiusX = (insetRimRight - insetRimLeft) / 2;
  const rimRadiusY = CUP_BEVEL;

  // The INTERIOR: a second, smaller ellipse, inset by the wall's own
  // thickness (`CUP_RIM_WALL`) and dropped a few px lower (`CUP_RIM_DEPTH`)
  // than the outer one. Drawing it smaller AND lower is what leaves an
  // annular ring around it rather than two concentric rims of equal
  // thickness all the way round — the far edge of that ring (visually the
  // TOP of the ellipse) reads wider than the near edge (the BOTTOM),
  // exactly the foreshortening a real mouth shows when looked into at an
  // angle rather than photographed dead level.
  const interiorRadiusX = Math.max(rimRadiusX - CUP_RIM_WALL, 1);
  const interiorRadiusY = Math.max(rimRadiusY - CUP_RIM_WALL / 2, 1);
  const interiorCenterY = insetTop + CUP_RIM_DEPTH;
  const interiorLeft = rimCenterX - interiorRadiusX;
  const interiorRight = rimCenterX + interiorRadiusX;
  // Two half-ellipses, not one flat fill: the far half (drawn through the
  // point ABOVE centre, sweep-flag 1) catches the scene's own top-left
  // light same as the body's own "lit" path does; the near half (through
  // the point BELOW centre, sweep-flag 0) is the cup's own shadow falling
  // across its nearest inside wall. Both closed by the same chord back
  // through the centre line, both flat fills — no gradient, so still no
  // `<defs>`.
  const interiorFar = `M${String(interiorLeft)} ${String(interiorCenterY)} A${String(interiorRadiusX)} ${String(interiorRadiusY)} 0 0 1 ${String(interiorRight)} ${String(interiorCenterY)} Z`;
  const interiorNear = `M${String(interiorLeft)} ${String(interiorCenterY)} A${String(interiorRadiusX)} ${String(interiorRadiusY)} 0 0 0 ${String(interiorRight)} ${String(interiorCenterY)} Z`;

  // The three seams: flat strokes only, tapered the same way the
  // silhouette itself tapers (narrower at the rim, wider at the base) so
  // they read as staves/stitching ON the trapezoid rather than a separate
  // shape drawn in front of it.
  const seamFractions = [0.25, 0.5, 0.75];
  const seams = seamFractions
    .map((fraction) => {
      const x1 = insetRimLeft + fraction * (insetRimRight - insetRimLeft);
      const x2 = insetBaseLeft + fraction * (insetBaseRight - insetBaseLeft);
      return `<path d="M${String(x1)} ${String(insetTop)} L${String(x2)} ${String(insetBottom)}" fill="none" stroke="var(--dice-cup-edge)" stroke-width="1" stroke-linecap="round" />`;
    })
    .join("");

  return [
    `<svg viewBox="${CUP_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">`,
    `<polygon points="${String(rimLeft)},${String(top)} ${String(rimRight)},${String(top)} ${String(CUP_WIDTH)},${String(bottom)} 0,${String(bottom)}" fill="var(--dice-cup-face)" stroke="var(--dice-cup-edge)" stroke-width="1" stroke-linejoin="round" />`,
    seams,
    `<path d="${lit}" fill="none" stroke="var(--dice-cup-bevel-light)" stroke-width="${String(CUP_BEVEL)}" stroke-linecap="round" stroke-linejoin="round" />`,
    `<path d="${shaded}" fill="none" stroke="var(--dice-cup-bevel-shade)" stroke-width="${String(CUP_BEVEL)}" stroke-linecap="round" stroke-linejoin="round" />`,
    `<ellipse cx="${String(rimCenterX)}" cy="${String(insetTop)}" rx="${String(rimRadiusX)}" ry="${String(rimRadiusY)}" fill="var(--dice-cup-bevel-light)" stroke="var(--dice-cup-edge)" stroke-width="1" />`,
    `<path d="${interiorFar}" fill="var(--dice-cup-interior-light)" />`,
    `<path d="${interiorNear}" fill="var(--dice-cup-interior-shade)" />`,
    `</svg>`,
  ].join("");
}
