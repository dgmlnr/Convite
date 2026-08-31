/**
 * The four surfaces a tile has, and every one of them is ours to paint.
 *
 * The deck could only make its BACK themeable, because its fronts are shipped
 * rasters and a raster cannot answer to a custom property. A mahjong tile is
 * the other way round: the shipped raster is the face SYMBOL only, transparent
 * behind it, so the slab it sits on, its edges and its corners are generated
 * SVG (`tile-body.ts`) and all of them are theme surfaces. The one thing that
 * stays fixed across every tenant is the symbol itself — which is correct for
 * the same reason the card fronts are: a five of circles has to look like a
 * five of circles everywhere.
 *
 * Defaults are ivory rather than white on purpose: a real tile is bone, and
 * pure white beside a felt table reads as a hole in it.
 */
export const TILE_THEME_DEFAULTS = {
  "--mj-tile-face": "#f4efe2",
  "--mj-tile-edge": "#cbbfa4",
  "--mj-tile-bevel-light": "#fffdf6",
  "--mj-tile-bevel-shade": "#a89b7c",
} as const;

export type TileThemeToken = keyof typeof TILE_THEME_DEFAULTS;
