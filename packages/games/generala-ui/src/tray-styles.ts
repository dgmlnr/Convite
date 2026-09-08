export const TRAY_STYLE_ID = "hexdev-generala-tray-styles";

/**
 * THE TRAY'S OWN SHEET, AND IT DECLARES NO GEOMETRY.
 *
 * There is no width, no height and no scale below. Every die in this tray is
 * a `.hexdev-dice-scene-box` that `dice-ui` already sizes — responsive ladder
 * included — and the whole reason slice 12 put that box in `dice-ui` was so
 * that this file would never have a number to get wrong. What is here is the
 * part that IS this package's: a button reset, a held cue, a focus ring, and
 * a row that wraps.
 *
 * THE BORDER IS DECLARED ON EVERY DIE, TRANSPARENT WHEN IT IS NOT HELD, and
 * that is deliberate rather than tidy. A border that appears only on the held
 * die would grow the flex item by 4px the instant it is pressed, so the whole
 * row would reflow under the player's finger and the dice beside it would
 * step sideways. Reserving it costs the same 4px on all five, always, which
 * is a layout nobody has to think about.
 *
 * TWO NON-COLOUR CUES FOR "HELD" (WCAG 1.4.1), the same pair
 * `escoba-ui`'s marked card uses and for the same reason: a solid border
 * where there was a transparent one, and a lift. Colour alone would leave a
 * player who cannot see the gold with an `aria-pressed` a screen reader
 * announces and nothing a sighted colour-blind player could read at all.
 */
export function buildTrayStylesheet(): string {
  return `
.hexdev-generala-tray {
  /* DECLARED, not only read. \`stylesheet-tokens.test.ts\` refuses a
     \`var()\` naming a property nothing in the product has and no namespace
     the reading package owns -- it caught this sheet inventing \`--generala-\`
     out of nothing on its first run. Declaring the gap here is what makes
     \`--generala-\` a namespace this package owns, and it is a real knob
     besides: the one number the row spends between dice. */
  --generala-die-gap: 4px;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: center;
  gap: var(--generala-die-gap);
}

.hexdev-generala-die {
  appearance: none;
  background: transparent;
  font: inherit;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 10px;
  /* NO \`line-height: 0\` HERE, and its absence was measured rather than
     assumed. It is the reflex declaration for a button wrapping artwork, and
     deleting it moved nothing: this button's only child is the block-level
     \`.hexdev-dice-scene-box\`, so no line box is generated for a line height
     to apply to. It would also be actively wrong the day a visible number
     joined the die. A clause with nothing to observe is not a free belt. */
  cursor: pointer;
}

.hexdev-generala-die[aria-pressed="true"] {
  border-color: var(--gx-color-accent, var(--hx-gold, #e8c877));
  transform: translateY(-6px);
}

.hexdev-generala-die:focus-visible {
  outline: 3px solid var(--generala-focus-ring, #2563eb);
  outline-offset: 2px;
}

/* A die nobody may hold any more still SHOWS what was rolled -- it is what
   the player is about to score -- so it keeps its full contrast and only
   stops inviting a press. Dimming it would hide the five faces the whole
   decision is made from. */
.hexdev-generala-die:disabled {
  cursor: default;
}

.hexdev-generala-die--empty {
  cursor: default;
}

/* THE CONTROL THAT COMMITS. It is the only text on this surface, so it is the
   only place a missing font-family would actually be visible -- the same
   argument \`escoba-ui\`'s own \`.hexdev-escoba-sum\` makes for itself. */
.hexdev-generala-roll {
  appearance: none;
  font: inherit;
  font-family: var(--gx-font-family, system-ui, sans-serif);
  padding: 8px 16px;
  border: 2px solid var(--gx-color-accent, var(--hx-gold, #e8c877));
  border-radius: var(--gx-radius, 12px);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.hexdev-generala-roll:focus-visible {
  outline: 3px solid var(--generala-focus-ring, #2563eb);
  outline-offset: 2px;
}

.hexdev-generala-roll:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (prefers-reduced-motion: reduce) {
  .hexdev-generala-die[aria-pressed="true"] {
    transform: none;
  }
}
`;
}

/** Injects the stylesheet at most once per document — the same idempotence
 * guard every `ensure*` helper in this repository uses, so a second tray on
 * the same page never duplicates the `<style>` tag. */
export function ensureTrayStyles(doc: Document): void {
  if (doc.getElementById(TRAY_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = TRAY_STYLE_ID;
  style.textContent = buildTrayStylesheet();
  doc.head.appendChild(style);
}
