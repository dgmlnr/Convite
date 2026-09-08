export const SERVIDA_STYLE_ID = "hexdev-generala-servida-styles";

/**
 * THE CALLOUT'S OWN SHEET, and it is deliberately quiet.
 *
 * This is a note about a rule, not an alarm and not a control: it appears on
 * the first throw of every turn, so a banner shouting at a player once per
 * turn for a whole match is exactly what it must not be. What it gets is a
 * rule down the leading edge and a tint, which is how this repository's other
 * inline notes are drawn.
 *
 * NOT A COLOUR ON ITS OWN (WCAG 1.4.1). The border and the tint are both
 * lightness against whatever the board provides rather than a hue, so a
 * colour-blind player reads the same thing everybody else does — and the text
 * says "Servida" in words besides, which is the cue that never depended on
 * seeing anything.
 *
 * `--generala-` IS A NAMESPACE THIS PACKAGE OWNS, so a knob is DECLARED here
 * before it is read. `stylesheet-tokens.test.ts` refuses a `var()` naming a
 * property nothing in the product has and no namespace the reading package
 * owns; it caught `tray-styles.ts` inventing `--generala-` out of nothing on
 * its first run, and the same rule applies to every sheet that follows.
 */
export function buildServidaStylesheet(): string {
  return `
.hexdev-generala-servida {
  /* The ink the rule down the edge is drawn in, declared rather than only
     read — and a real knob besides: a board with its own accent may want
     this note to belong to it. */
  --generala-servida-rule: var(--gx-color-accent, var(--hx-gold, #e8c877));
  font-family: var(--gx-font-family, system-ui, sans-serif);
  font-size: 0.9rem;
  color: inherit;
  margin: 0;
  padding: 6px 10px;
  border-left: 3px solid var(--generala-servida-rule);
  border-radius: 0 var(--gx-radius, 12px) var(--gx-radius, 12px) 0;
  background: rgba(255, 255, 255, 0.07);
}
`;
}

/** Injects the stylesheet at most once per document — the same idempotence
 * guard every `ensure*` helper in this repository uses, so a board holding
 * two of these never duplicates the `<style>` tag. */
export function ensureServidaStyles(doc: Document): void {
  if (doc.getElementById(SERVIDA_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = SERVIDA_STYLE_ID;
  style.textContent = buildServidaStylesheet();
  doc.head.appendChild(style);
}
