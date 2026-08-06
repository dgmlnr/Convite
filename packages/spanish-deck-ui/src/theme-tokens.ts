// Two theme surfaces were originally planned here (front + back), matching
// the product decision (obs 2955): the FRONT stays fixed identity, the BACK
// is the tenant-themeable surface. The front is now a real Fournier 1878
// photograph (front-image.ts) rather than generated SVG, and a raster image
// can't respond to a CSS custom property — so the front tokens
// (`--deck-card-bg`/`--deck-border`/`--deck-ink`/`--deck-suit-*`) are gone,
// not renamed. Only the back remains themeable, exactly as obs 2955 always
// intended it to be the ONE branding surface: it's what the opponent's hand
// shows, and it's always on screen.
export const DECK_THEME_DEFAULTS = {
  "--deck-back-bg": "#123b2e",
  "--deck-back-accent": "#d8b45a",
} as const;

export type DeckThemeToken = keyof typeof DECK_THEME_DEFAULTS;
