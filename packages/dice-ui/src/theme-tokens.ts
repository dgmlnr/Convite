/**
 * The one surface still worth theming after the raster pass.
 *
 * NARROWED FROM NINE TOKENS TO ONE. Before Blender renders replaced the die
 * and cup's flat SVG bodies (`art.ts`'s own header has the full story), this
 * package had no shipped raster at all, so every colour — face, edge, bevel,
 * pip, cup face, cup interior — was a `--dice-*` custom property a tenant
 * could repaint, the same argument `mahjong-tile-ui/theme-tokens.ts` still
 * makes for ITS four surfaces. A rendered WebP has none of that: its colours
 * are baked into pixels, exactly like the mahjong tile's own hanzi glyphs
 * were already baked into ITS shipped raster — `mahjong-tile-ui` never
 * defaulted a token for glyph ink, for the identical reason.
 *
 * `--dice-cup-bevel-light` survives because `dice-styles.ts`'s
 * `:focus-visible` outline still reads it directly — a keyboard focus ring
 * is UI chrome drawn on top of the artwork, not a colour the artwork itself
 * carries, so it stays a theme surface even though the leather under it no
 * longer is one.
 */
export const DICE_THEME_DEFAULTS = {
  "--dice-cup-bevel-light": "#7c5636",
} as const;

export type DiceThemeToken = keyof typeof DICE_THEME_DEFAULTS;
