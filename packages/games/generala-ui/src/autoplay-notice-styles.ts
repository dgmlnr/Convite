export const AUTOPLAY_NOTICE_STYLE_ID = "hexdev-generala-autoplay-notice-styles";

/** The class the slot the board mounts wears, exported so the render that sets
 * it and the sheet that hides it when empty cannot disagree about the one
 * string they both have to say. */
export const AUTOPLAY_SLOT_CLASS = "hexdev-generala-autoplay-slot";

/**
 * THE NOTICE'S OWN SHEET, drawn to be told apart from the note beside it.
 *
 * `servida-styles.ts` is the other inline note on this board: a panel with a
 * rule down its leading edge, in the accent, appearing on the first throw of
 * every turn. This one is rare and consequential, and the two can be on screen
 * together — a turn taken over, then the rival's move, then a servida throw of
 * your own. Two notes drawn alike is exactly the defect this planilla has
 * already shipped once, so the difference is structural: a border on ALL FOUR
 * sides rather than one, a clock face rather than nothing, and words that say
 * what happened. Three channels, and not one of them a hue (WCAG 1.4.1).
 *
 * THE TINT IS THE CALLOUT'S OWN, DELIBERATELY. Making this one darker or
 * brighter would be a fourth channel of difference bought with a legibility
 * measurement, and the three above already do the job — while a tint nobody
 * measured is the exact shape of the 1.07:1 this repository found by looking.
 * `chrome-contrast.browser.test.ts` measures the words on this panel over the
 * real board anyway, because "the same as the one next door" is a claim and
 * not a measurement.
 */
export function buildAutoplayNoticeStylesheet(): string {
  return `
/* AN EMPTY SLOT TAKES NO ROOM. The board mounts this container once and it
   holds nothing on nearly every render, so in the column's \`gap: 12px\` stack
   it would cost 12px of a phone's height on every board where the timer never
   fired. Found by looking at the render; no assertion here can see a gap. */
.${AUTOPLAY_SLOT_CLASS}:empty {
  display: none;
}

.hexdev-generala-autoplay {
  /* Declared before it is read: \`--generala-\` is a namespace this package
     owns (\`stylesheet-tokens.test.ts\`), and the edge of a boxed note is a
     real knob for a board with its own chrome. */
  --generala-autoplay-edge: var(--hx-felt-outline, rgba(255, 255, 255, 0.28));
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-family: var(--gx-font-family, system-ui, sans-serif);
  font-size: 0.9rem;
  color: inherit;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--generala-autoplay-edge);
  border-radius: var(--gx-radius, 12px);
  background: rgba(255, 255, 255, 0.07);
}

/* THE CLOCK, at the size of the line it sits on and pinned to its top so a
   sentence that wraps to two lines does not drag it to the middle. Stroked
   from \`currentColor\`, so it is the panel's own ink and there is no second
   value to measure. */
.hexdev-generala-autoplay-mark {
  flex: none;
  margin-top: 2px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
`;
}

/** Injects the stylesheet at most once per document — the same idempotence
 * guard every `ensure*` helper in this package uses, so a board rendered on
 * every message never duplicates the `<style>` tag. */
export function ensureAutoplayNoticeStyles(doc: Document): void {
  if (doc.getElementById(AUTOPLAY_NOTICE_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = AUTOPLAY_NOTICE_STYLE_ID;
  style.textContent = buildAutoplayNoticeStylesheet();
  doc.head.appendChild(style);
}
