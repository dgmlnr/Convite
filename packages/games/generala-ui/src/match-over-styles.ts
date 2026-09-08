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
 * THE BOARD PROVIDES THE POSITIONING CONTEXT. This element is
 * `position: absolute; inset: 0`, so it covers whatever is positioned above
 * it — the identical contract `escoba-ui`'s overlay has with the mount its
 * widget registry builds. What is different is where the rule for that lives:
 * escoba's sheet reaches out and declares `position: relative` on somebody
 * else's element, and this one does not, because a board may want the overlay
 * over the whole table or over one panel of it and only the board knows which.
 *
 * IT DECLARES ITS OWN CONTAINER even though nothing queries it yet. An
 * overlay sits on top of the board that mounts it, so the board's box is the
 * measurement that means something — a phone-sized viewport with a wide board
 * and a desktop viewport with a narrow one are both real, and only one of the
 * two axes can tell them apart. The shape change that reads it arrives with
 * the controls, in the next unit; establishing the container here is what
 * keeps that a stylesheet edit rather than a structural one.
 *
 * IT ANCHORS ITSELF ON ITS OWN CONTAINER, not on a class it hopes the board
 * declared. `.hexdev-escoba-match-over-styles` had to add `position: relative`
 * to the outer mount the widget registry builds, which is a rule about
 * somebody else's element; here the renderer sets `position: relative` on the
 * container it is handed, so a board that mounts this anywhere gets a
 * correctly anchored overlay without being told to add a class.
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
  --generala-veil: rgba(0, 0, 0, 0.72);
  container-type: inline-size;
  container-name: hexdev-generala-match-over;
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
  font-family: var(--gx-font-family, system-ui, sans-serif);
  background: var(--generala-veil);
  color: var(--gx-color-on-surface, #f2f2f2);
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
