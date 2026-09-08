export const SCORECARD_STYLE_ID = "hexdev-generala-scorecard-styles";

/**
 * THE PLANILLA'S OWN SHEET.
 *
 * A table is the rare element that lays itself out well with almost no CSS,
 * so what is here is only the part a browser would not do for a planilla: the
 * rules drawn between the boxes, and the two marks that say what a box IS —
 * blank because nobody has written in it, or a zero somebody spent.
 *
 * IT DECLARES NO WIDTH, and that is deliberate rather than unfinished. The
 * planilla takes the row it is given; how it survives the narrow end of the
 * range is a measurement nothing here has taken yet.
 */
export function buildScorecardStylesheet(): string {
  return `
.hexdev-generala-scorecard {
  /* Declared here so \`--generala-\` stays a namespace this package owns
     rather than one it only reads from (\`stylesheet-tokens.test.ts\`), and
     because it is a real knob a board may want: the ink the rules between
     boxes are drawn in. */
  --generala-planilla-rule: var(--hx-felt-outline, rgba(255, 255, 255, 0.28));
  font-family: var(--gx-font-family, system-ui, sans-serif);
  color: inherit;
}

.hexdev-generala-scorecard-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  /* Digits of equal width, so a column of scores lines up as a column of
     numbers instead of a ragged edge. */
  font-variant-numeric: tabular-nums;
}

.hexdev-generala-scorecard-caption {
  caption-side: top;
  text-align: left;
  padding: 0 6px 6px;
  font-weight: 600;
}

.hexdev-generala-scorecard-table th,
.hexdev-generala-scorecard-table td {
  border: 1px solid var(--generala-planilla-rule);
  padding: 6px;
  text-align: center;
}

/* The category names, left-aligned like a printed planilla's. */
.hexdev-generala-scorecard-table th[scope="row"] {
  text-align: left;
  font-weight: 400;
}

.hexdev-generala-scorecard-table thead th,
.hexdev-generala-scorecard-table tfoot th,
.hexdev-generala-scorecard-table tfoot td {
  font-weight: 700;
}

/* The corner: it heads neither a row nor a column, so it is drawn as the
   blank it is rather than as a box somebody forgot to fill. */
.hexdev-generala-scorecard-corner {
  border-color: transparent;
}

/* AN OPEN BOX IS BLANK, AND THE DASH IS DRAWN RATHER THAN WRITTEN. A real
   planilla leaves it empty; a screen reader reading an empty cell says so,
   which is the truth, while a literal "—" in the markup would have it read
   out an em dash eleven times per card. So the mark is generated content:
   sighted players get the notation, assistive tech gets the blank.

   THE 0.5 IS THE ONE NUMBER HERE THAT COULD HIDE SOMETHING. Twenty-two of a
   fresh planilla's twenty-two boxes are open, so a full-contrast dash would
   out-shout the handful of numbers a player is actually reading; dimming it
   is what makes the card scan. MEASURED rather than assumed: against
   \`#f4efe2\` on the \`#14231d\` felt the scene renders on, the blended mark
   computes to 4.62:1 — above the 4.5:1 AA floor for text this size, with
   very little room under it. The SHIPPED background belongs to the board
   that mounts this planilla and does not exist yet, so that ratio is a
   measurement on a stand-in and not a guarantee this package can make. */
.hexdev-generala-scorecard-cell[data-state="open"]::after {
  content: "—";
  opacity: 0.5;
}

/* A BOX CROSSED AT ZERO KEEPS FULL CONTRAST. It is the information a rival
   plans around — a category already spent — so it is drawn as legibly as
   every other filled box, and the "0" it carries is what says it is spent
   (WCAG 1.4.1: the fact is in the text, never in a colour). The italic is a
   second, redundant cue and carries nothing on its own. */
.hexdev-generala-scorecard-cell[data-state="crossed"] {
  font-style: italic;
}
`;
}

/** Injects the stylesheet at most once per document — the same idempotence
 * guard every `ensure*` helper in this repository uses, so a board holding
 * two planillas never duplicates the `<style>` tag. */
export function ensureScorecardStyles(doc: Document): void {
  if (doc.getElementById(SCORECARD_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = SCORECARD_STYLE_ID;
  style.textContent = buildScorecardStylesheet();
  doc.head.appendChild(style);
}
