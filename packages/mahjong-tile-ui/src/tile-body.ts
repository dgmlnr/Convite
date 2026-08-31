import { TILE_BEVEL, TILE_FRAME, TILE_HEIGHT, TILE_RADIUS, TILE_VIEWBOX, TILE_WIDTH } from "./geometry.js";

/**
 * The half of a tile this repository owns — generated, the way `card-back.ts`
 * generates the card back rather than shipping it.
 *
 * WHAT IS ACTUALLY MISSING FROM THE ARTWORK, and it is not what the asset
 * survey said. The 42 shipped rasters are not a bare symbol: each one draws
 * the tile's own dark rounded outline out to the canvas edge and leaves the
 * INTERIOR transparent. So what a player would see without this function is
 * a tile-shaped hole with a symbol floating in it — the felt straight
 * through the middle. This draws the bone behind it, and the light that
 * turns a flat shape into an object with thickness. None of it is a
 * derivative of anybody's CC BY-SA artwork.
 *
 * A NESTED SVG PER TILE, NOT A CSS PSEUDO-ELEMENT, and that was measured
 * rather than assumed. The intuition says `::before`/`::after` cost zero
 * extra nodes; the measurement says those "zero nodes" are 864 real layout
 * boxes and the pseudo-element board renders SLOWER (9.75ms) than the
 * nested-SVG one (7.2ms, 720 nodes). Extra SVG nodes are not CSS boxes.
 * Consistent across four independent runs, 2.87% pixel difference, neither
 * looking worse.
 *
 * NO `<defs>`, DELIBERATELY. A gradient bevel would need one, and this
 * repository already carries the scar of a `<defs>` whose custom properties
 * were scoped to a subtree the referencing element was not in. Flat fills
 * need none, and the bevel is stroked along the rounded outline so it follows
 * the corners without a clip path either. Whether the bevel earns a gradient
 * is the board slice's decision and can be taken without moving anything
 * here.
 */
export function tileBodySvg(): string {
  // The bevel lives INSIDE the artwork's own frame, because that is the only
  // region the artwork leaves transparent — a ring drawn at the boundary
  // would be painted over by the outline it is supposed to give depth to.
  const inset = TILE_FRAME + TILE_BEVEL / 2;
  const radius = Math.max(TILE_RADIUS - inset, 0);
  const right = TILE_WIDTH - inset;
  const bottom = TILE_HEIGHT - inset;

  // Lit above and to the left, shaded below and to the right: one light
  // source, top-left, which is what makes a flat rectangle read as an object
  // with thickness. Painting both halves the same colour leaves a bordered
  // rectangle that still looks like working markup.
  const lit = [
    `M${String(inset)} ${String(bottom - radius)}`,
    `L${String(inset)} ${String(inset + radius)}`,
    `A${String(radius)} ${String(radius)} 0 0 1 ${String(inset + radius)} ${String(inset)}`,
    `L${String(right - radius)} ${String(inset)}`,
    `A${String(radius)} ${String(radius)} 0 0 1 ${String(right)} ${String(inset + radius)}`,
  ].join(" ");
  const shaded = [
    `M${String(right)} ${String(inset + radius)}`,
    `L${String(right)} ${String(bottom - radius)}`,
    `A${String(radius)} ${String(radius)} 0 0 1 ${String(right - radius)} ${String(bottom)}`,
    `L${String(inset + radius)} ${String(bottom)}`,
    `A${String(radius)} ${String(radius)} 0 0 1 ${String(inset)} ${String(bottom - radius)}`,
  ].join(" ");

  return [
    `<svg viewBox="${TILE_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">`,
    // The bone. Full box, because the artwork's outline sits exactly here and
    // the fill has to reach under it or a hairline of felt shows at the edge.
    `<rect x="0" y="0" width="${String(TILE_WIDTH)}" height="${String(TILE_HEIGHT)}" rx="${String(TILE_RADIUS)}" fill="var(--mj-tile-face)" stroke="var(--mj-tile-edge)" stroke-width="1" />`,
    `<path d="${lit}" fill="none" stroke="var(--mj-tile-bevel-light)" stroke-width="${String(TILE_BEVEL)}" stroke-linecap="round" />`,
    `<path d="${shaded}" fill="none" stroke="var(--mj-tile-bevel-shade)" stroke-width="${String(TILE_BEVEL)}" stroke-linecap="round" />`,
    `</svg>`,
  ].join("");
}
