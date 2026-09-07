export const SCORECARD_STYLE_ID = "hexdev-generala-scorecard-styles";

/**
 * THE PLANILLA'S OWN SHEET.
 *
 * A table is the rare element that lays itself out well with almost no CSS,
 * so what is here is only the part a browser would not do for a planilla: the
 * rules drawn between the boxes, which is what turns a stack of numbers into
 * a grid somebody can read a row across.
 *
 * IT SAYS NOTHING YET ABOUT WHAT A BOX IS, and it declares no width. What a
 * written box says about itself, and how the planilla survives the narrow end
 * of the range, are two later units — neither is a measurement anything here
 * has taken.
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
