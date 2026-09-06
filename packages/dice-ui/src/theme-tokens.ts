/**
 * The surfaces a die and a cup have, and every one of them is a theme
 * surface — the same argument `mahjong-tile-ui/theme-tokens.ts` makes for the
 * tile's four surfaces, one tier lower: nothing this package draws is a
 * shipped raster, so nothing is fixed at build time.
 *
 * `--dice-*`, NOT `--gx-*` directly, and that is deliberate rather than an
 * oversight: this package is L0, exactly like `mahjong-tile-ui`, and
 * `mahjong-tile-ui/theme-tokens.ts` does not reference `--gx-*` either — the
 * bridge from a tenant's `--gx-color-accent` into `--mj-tile-face` lives one
 * layer up, in `mahjong-solitaire-ui/board-styles.ts`
 * (`color-mix(in srgb, var(--gx-color-accent, #d4af37) 38%, #f4efe2)`),
 * because that is the L1 package that actually knows a tenant theme exists.
 * No Generala board package exists yet (this package's own scope, see
 * `src/index.ts`), so there is nothing to bridge FROM today — but the shape
 * these tokens leave behind is exactly the shape that bridge slots into,
 * unchanged, the day one is built.
 *
 * Defaults are a natural bone/leather palette rather than a saturated brand
 * colour, for the same reason the tile defaults are ivory rather than white:
 * these are the UNTHEMED look, and a real die is bone or ivory, a real cup is
 * leather or wood.
 */
export const DICE_THEME_DEFAULTS = {
  "--dice-face": "#f6f2e8",
  "--dice-edge": "#c7bda3",
  "--dice-bevel-light": "#fffdf6",
  "--dice-bevel-shade": "#a89a78",
  "--dice-pip": "#2c2620",
  "--dice-cup-face": "#5b3a24",
  "--dice-cup-edge": "#3a2313",
  "--dice-cup-bevel-light": "#7c5636",
  "--dice-cup-bevel-shade": "#28160b",
  /**
   * THE TWO SURFACES THAT MAKE A CUP READ AS HOLLOW RATHER THAN A LID: the
   * inside back wall, which — because the light in this scene comes from
   * the same top-left source the bevel already commits to — catches some of
   * it (`-light`), and the inside near wall, permanently in the cup's own
   * shadow (`-shade`), both darker than either exterior bevel tone because
   * "looking into" a leather or wood vessel is looking into shadow, not at
   * another lit face. Added for the second visual pass
   * (`sdd/generala-props/explore`'s owner objection: "a cubilete of
   * quality" — see `cup-body.ts`), never referenced before it.
   */
  "--dice-cup-interior-light": "#3d2410",
  "--dice-cup-interior-shade": "#0a0503",
} as const;

export type DiceThemeToken = keyof typeof DICE_THEME_DEFAULTS;
