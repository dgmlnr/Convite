export const MATCH_OVER_STYLE_ID = "hexdev-generala-match-over-styles";

/**
 * THE END-OF-MATCH OVERLAY'S SHEET.
 *
 * `:empty { display: none }` IS THE WHOLE SHOW/HIDE MECHANISM, the same one
 * `escoba-ui`'s overlay uses, and it is why the renderer empties its
 * container instead of hiding a wrapper inside it: an overlay that is over
 * has no children, and a rule that keys on that cannot get out of step with
 * the state the way a `data-` attribute somebody forgot to clear would.
 *
 * A CONTAINER QUERY AND NEVER A WIDTH `@media`, which is the convention
 * `escoba-ui` states about every sheet it ships and `rail.browser.test.ts`
 * asserts of its own. An overlay sits on top of the board that mounts it, so
 * the board's box is the measurement that means something — a phone-sized
 * viewport with a wide board and a desktop viewport with a narrow one are
 * both real, and only one of the two axes can tell them apart, which is
 * exactly the case this game will be in from the slice that mounts a tray
 * beside a planilla.
 *
 * THE BOARD PROVIDES THE POSITIONING CONTEXT. This element is
 * `position: absolute; inset: 0`, so it covers whatever is positioned above
 * it — the identical contract `escoba-ui`'s overlay has with the mount its
 * widget registry builds. What is different is where the rule for that lives:
 * escoba's sheet reaches out and declares `position: relative` on somebody
 * else's element, and this one does not, because a board may want the overlay
 * over the whole table or over one panel of it and only the board knows which.
 */
export function buildMatchOverStylesheet(): string {
  return `
.hexdev-generala-match-over:empty {
  display: none;
}

.hexdev-generala-match-over {
  /* Declared, not only read: \`--generala-\` is a namespace this package owns
     (\`stylesheet-tokens.test.ts\`), and the veil is a real knob — a board with
     a lighter felt wants a different one. */
  --generala-veil: rgba(0, 0, 0, 0.45);
  /* The panel's own ink, declared beside the veil because the two only make
     sense as a pair: the veil is thin precisely because the panel is not. */
  --generala-verdict-surface: #0e1713;
  container-type: inline-size;
  container-name: hexdev-generala-match-over;
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  text-align: center;
  font-family: var(--gx-font-family, system-ui, sans-serif);
  background: var(--generala-veil);
  color: var(--gx-color-on-surface, #f2f2f2);
}

/* THE PANEL THE VERDICT IS PRINTED ON. Opaque, and that is the whole point:
   a background you can see through is a background somebody else's text comes
   through, which is exactly what a finished planilla under a 0.72 veil did to
   these four lines. With the panel carrying the reading, the veil can go back
   to being thin enough to leave the card legible AROUND it — which is why
   this is an overlay and not the opaque screen \`escoba-ui\` mounts. */
.hexdev-generala-match-over-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 100%;
  padding: 16px 20px;
  border: 1px solid var(--generala-planilla-rule, rgba(232, 200, 119, 0.35));
  border-radius: var(--gx-radius, 12px);
  background: var(--generala-verdict-surface);
}

.hexdev-generala-match-over-headline {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 800;
}

.hexdev-generala-match-over-winners {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.hexdev-generala-match-over-score {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.hexdev-generala-match-over-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

/* The standard's 44px, again — the same floor \`scorecard-styles.ts\` states
   for a score box and for the same reason, and declared rather than imported
   from it: a rematch button and a planilla cell agree because they read one
   standard, not because one reads the other. */
.hexdev-generala-match-over-actions button {
  min-height: 44px;
  padding: 10px 24px;
  border-radius: var(--gx-radius, 12px);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.hexdev-generala-match-over-actions button[data-action="play-again"] {
  border: 0;
  background: var(--gx-color-accent, var(--hx-gold, #e8c877));
  color: var(--gx-color-on-primary, #14231d);
}

.hexdev-generala-match-over-actions button[data-action="leave-match"] {
  border: 2px solid currentColor;
  background: transparent;
  color: inherit;
}

.hexdev-generala-match-over-actions button:focus-visible {
  outline: 3px solid var(--generala-focus-ring, #2563eb);
  outline-offset: 2px;
}

/* THE ONE SHAPE CHANGE, ON THE BOARD'S OWN BOX. Below this the two controls
   stack, because side by side in a narrow board they are two 44px targets
   sharing a row with a gap and neither is comfortably reachable. */
@container hexdev-generala-match-over (max-width: 360px) {
  .hexdev-generala-match-over-actions {
    flex-direction: column;
    align-self: stretch;
  }
}
`;
}

/** Injects the stylesheet at most once per document — the same idempotence
 * guard every `ensure*` helper in this repository uses. */
export function ensureMatchOverStyles(doc: Document): void {
  if (doc.getElementById(MATCH_OVER_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = MATCH_OVER_STYLE_ID;
  style.textContent = buildMatchOverStylesheet();
  doc.head.appendChild(style);
}
