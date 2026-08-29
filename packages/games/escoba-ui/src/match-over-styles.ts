export const MATCH_OVER_STYLE_ID = "hexdev-escoba-match-over-styles";

/**
 * The end-of-match overlay (slice R2). Container-query only, same rule as
 * every `*-styles.ts` in this package. `.hexdev-escoba-match` (the outer
 * mount `game-ui-registry.ts` builds) had NO rule at all before this slice —
 * `position: relative` lives here because this is the first thing that
 * needs to anchor an absolutely-positioned child over it.
 */
export function buildMatchOverStylesheet(): string {
  return `
.hexdev-escoba-match { position: relative; }

.hexdev-escoba-match-over:empty { display: none; }
.hexdev-escoba-match-over {
  container-type: inline-size;
  container-name: hexdev-escoba-match-over;
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
  text-align: center;
  font-family: var(--gx-font-family, system-ui, sans-serif);
  background: var(--gx-color-surface, #1c1c1c);
  color: var(--gx-color-on-surface, #f2f2f2);
}
.hexdev-escoba-match-over[data-result="won"] {
  background: var(--gx-color-primary, #1e5c43);
  color: var(--gx-color-on-primary, #ffffff);
}
.hexdev-escoba-match-over-headline { margin: 0; font-size: 1.5rem; font-weight: 800; }
.hexdev-escoba-match-over-score { margin: 0; font-size: 1.1rem; font-weight: 600; }
.hexdev-escoba-match-over-actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.hexdev-escoba-match-over-actions button {
  min-height: 44px;
  padding: 10px 24px;
  border-radius: 999px;
  font-family: inherit;
  font-weight: 700;
  cursor: pointer;
}
.hexdev-escoba-match-over-actions button[data-action="play-again"] {
  border: none;
  background: var(--gx-color-accent, #d4af37);
  color: #1c1c1c;
}
.hexdev-escoba-match-over-actions button[data-action="leave-match"] {
  background: transparent;
  color: inherit;
  border: 1px solid currentColor;
}
`;
}

/** Injects the stylesheet at most once per document — same idempotence as
 * every other `ensure*` helper in this package. */
export function ensureMatchOverStyles(doc: Document): void {
  if (doc.getElementById(MATCH_OVER_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = MATCH_OVER_STYLE_ID;
  style.textContent = buildMatchOverStylesheet();
  doc.head.appendChild(style);
}
