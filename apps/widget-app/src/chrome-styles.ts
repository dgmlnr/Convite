export const CHROME_STYLE_ID = "hexdev-gamify-chrome-styles";

/**
 * The lobby/selection screen's own stylesheet, generated as a string for the
 * same reason `truco-ui`'s `table-styles.ts` is: this package builds via
 * plain `vite build` for its app bundle, but nothing here needs a `.css`
 * loader either, and keeping the same "one string, injected once" pattern
 * across both presentational layers is deliberate consistency, not
 * incidental duplication.
 *
 * DESIGN §10 — hybrid theming by zone (obs 2955): this whole screen is
 * CHROME (the frame, the lobby, the selection, the controls), so EVERY rule
 * below reads a `--gx-*` tenant token, with a neutral fallback for a tenant
 * that sent none. Nothing here ever reaches for the table's own
 * `--truco-*`/`--deck-*` identity tokens — a strong-branded tenant must see
 * their colors on this screen, and a future second game must never need to
 * touch this file at all.
 */
export function buildChromeStylesheet(): string {
  return `
.hexdev-gamify-chrome {
  box-sizing: border-box;
  min-height: 100%;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  font-family: var(--gx-font-family, system-ui, sans-serif);
  color: var(--gx-color-on-surface, #1a1a1a);
  background: var(--gx-color-surface, #ffffff);
}
.hexdev-gamify-chrome * { box-sizing: border-box; }

.hexdev-chrome-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--gx-color-on-surface, #1a1a1a);
}

.hexdev-chrome-status {
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--gx-radius, 10px);
  background: var(--gx-color-primary, #2f6f4f);
  color: var(--gx-color-on-primary, #ffffff);
}

.hexdev-game-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border-radius: var(--gx-radius, 14px);
  background: color-mix(in srgb, var(--gx-color-primary, #2f6f4f) 6%, var(--gx-color-surface, #ffffff));
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.12);
}
.hexdev-game-card h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--gx-color-on-surface, #1a1a1a);
}

.hexdev-modality {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--gx-radius, 10px);
  background: color-mix(in srgb, var(--gx-color-on-surface, #1a1a1a) 5%, transparent);
}
.hexdev-modality p { margin: 0; }
.hexdev-modality-count {
  font-weight: 700;
  color: var(--gx-color-primary, #2f6f4f);
}

.hexdev-bot-row { display: flex; flex-wrap: wrap; gap: 8px; }

.hexdev-gamify-chrome button {
  min-height: 42px;
  padding: 9px 18px;
  border: 2px solid transparent;
  border-radius: var(--gx-radius, 999px);
  font-family: inherit;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  background: transparent;
  border-color: var(--gx-color-primary, #2f6f4f);
  color: var(--gx-color-on-surface, #1a1a1a);
}
.hexdev-gamify-chrome button:hover,
.hexdev-gamify-chrome button:focus-visible {
  filter: brightness(1.08);
}

/* The prominent action — vs-person when real players are waiting, vs-bot
 * when the zero-counter UX rule (spec) hides the count instead — gets the
 * solid, filled treatment; the secondary action stays outlined. Driven by
 * data-prominent, set once from the SAME entry.waitingCount/promoteBotFallback
 * value game-selection.ts already receives from deriveLobbyDisplay — never
 * re-decided here, only painted differently. */
.hexdev-modality[data-prominent="person"] button[data-action="vs-person"],
.hexdev-modality[data-prominent="bot"] button[data-action="vs-bot"] {
  background: var(--gx-color-accent, #ffd166);
  border-color: var(--gx-color-accent, #ffd166);
  color: #1a1a1a;
}

.hexdev-chrome-empty,
.hexdev-chrome-loading {
  margin: 0;
  color: var(--gx-color-on-surface, #1a1a1a);
  opacity: 0.75;
}
`.trim();
}

/** Idempotent injection into `<head>` — safe to call on every render, same
 * discipline as `truco-ui`'s `ensureTableStyles`. */
export function ensureChromeStyles(doc: Document): void {
  if (doc.getElementById(CHROME_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = CHROME_STYLE_ID;
  style.textContent = buildChromeStylesheet();
  doc.head.appendChild(style);
}
