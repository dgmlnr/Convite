// Two independent theme surfaces, matching the product decision (obs 2955):
// the FRONT stays truco's own identity (fixed by default, never bound to a
// tenant's brand — a card must stay legible under any brand), the BACK is
// the tenant-themeable surface, since it is what the opponent's hand shows
// and it is always on screen. Both are still expressed as CSS custom
// properties with sensible defaults here, never as inline hex, so a future
// consumer (truco-ui, an escoba-ui) can override either surface without
// touching a single SVG path.
export const DECK_THEME_DEFAULTS = {
  "--deck-card-bg": "#f7ecd4",
  "--deck-border": "#3a2b1a",
  "--deck-ink": "#241a10",
  "--deck-suit-oro": "#b8860b",
  "--deck-suit-copa": "#7a1f2b",
  "--deck-suit-espada": "#2b3a4a",
  "--deck-suit-basto": "#4a3520",
  "--deck-back-bg": "#123b2e",
  "--deck-back-accent": "#d8b45a",
} as const;

export type DeckThemeToken = keyof typeof DECK_THEME_DEFAULTS;
