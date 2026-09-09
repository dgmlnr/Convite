export const SCORECARD_STYLE_ID = "hexdev-generala-scorecard-styles";

/**
 * The smallest a box a thumb has to hit is allowed to be, in CSS pixels.
 *
 * WCAG 2.5.5's number, declared here rather than imported. `dice-ui` exports
 * a `CUP_TAP_MIN` holding the same 44, and reading THAT here would tie the
 * size of a scorecard box to the size of a dice cup: somebody enlarging the
 * cup for grip would silently grow eleven table cells. The two constants
 * agree because they read the same standard, not because one reads the
 * other.
 */
export const SCORE_TAP_MIN = 44;

/**
 * THE PLANILLA'S OWN SHEET.
 *
 * A table is the rare element that lays itself out well with almost no CSS,
 * so what is here is only the part a browser would not do for a planilla: the
 * rules drawn between the boxes, and the two marks that say what a box IS —
 * blank because nobody has written in it, or a zero somebody spent.
 *
 * `--generala-planilla-labels` IS THE LOAD-BEARING NUMBER. Under
 * `table-layout: fixed` the first column takes exactly this share and the
 * seats split the rest evenly, so ONE value decides both halves of the fit at
 * 320px: whether "Generala doble" survives on one line, and whether a seat's
 * column is still wide enough to hold a control a thumb can hit. The two pull
 * in opposite directions, which is what makes it a decision rather than a
 * taste. At 320px the page gives the table 304px: 44 % is 134px for the
 * labels and 85px for each of the two seats.
 *
 * THE ROW HEADERS DO NOT WRAP, on purpose, and the two rules above only make
 * sense together. A label column that is too narrow absorbs it by growing
 * TALLER — "Generala doble" quietly stacks onto two lines — which no width
 * measurement can see and which turns an eleven-row planilla into a
 * nineteen-row one on the phone that could least afford it. Refusing to wrap
 * converts that into an overflow, and an overflow is something a test can
 * see. Measured: removing the width alone reds the clipping fence, and
 * removing both reds the row-height one.
 *
 * THE COLUMN ON TURN IS DARKENED, AND THE DIRECTION IS A MEASUREMENT RATHER
 * THAN A TASTE.
 *
 * The reflex tint for "picked out" on a dark card is white at a few per cent,
 * and it is the one value that cell may not take: the open-box dash is
 * `--generala-board-ink` at 0.5 over the same background and measures 4.67:1
 * on the shipped board, which leaves nothing to spend. Computed over the real
 * `#14231d`, every white tint that is visible at all takes it under the AA
 * floor — 4.53:1 at 2 %, 4.47 at 3 %, 4.27 at 6 %, 3.98 at 10 % — so a
 * highlight anybody could SEE would have been paid for with the legibility of
 * twenty-two boxes.
 *
 * Darkening runs the other way: at 30 % black the same dash measures 4.82:1
 * and a written number 16.12:1, so the column a player is being told to look
 * at becomes the most legible one on the card instead of the least. Fenced in
 * `chrome-contrast.browser.test.ts`, on the board's own ground, because a
 * number nobody measures is a number that drifts.
 *
 * THE HEADING TAKES THE ACCENT AND NOT A HEAVIER WEIGHT, checked rather than
 * assumed: every `thead th` here is already `font-weight: 700`, and the fonts
 * this widget resolves `system-ui` to ship one bold face, so 700 and 800
 * render identically. A weight step would have been a declaration that
 * measured true and showed nothing. The accent is this design's own "live"
 * ink — the held ring, the throw control, the rematch button — and computes
 * to 11.14:1 on the darkened column.
 *
 * THE ARGUMENT LIVES OUT HERE AND NOT IN THE SHEET, which is a byte decision
 * as well as a reading one: everything between the backticks below is a
 * string this widget ships to every player, and `check:bundle` measures it.
 * The first draft of this change wrote these paragraphs inside the CSS and
 * cost the bundle 7.1 KB across the three sheets it touched.
 */
export function buildScorecardStylesheet(): string {
  return `
.hexdev-generala-scorecard {
  /* Declared here so \`--generala-\` stays a namespace this package owns
     rather than one it only reads from (\`stylesheet-tokens.test.ts\`), and
     because both are real knobs a board may want: the share of the row the
     category names take, and the ink the rules between boxes are drawn in. */
  --generala-planilla-labels: 44%;
  --generala-planilla-rule: var(--hx-felt-outline, rgba(255, 255, 255, 0.28));
  /* The column on turn. DARKER, and that direction is a measurement rather
     than a taste — see this file's header for the arithmetic. */
  --generala-planilla-turn: rgba(0, 0, 0, 0.3);
  font-family: var(--gx-font-family, system-ui, sans-serif);
  color: inherit;
}

.hexdev-generala-scorecard-table {
  width: 100%;
  border-collapse: collapse;
  /* THE COLUMNS DO NOT DEPEND ON WHAT IS IN THEM. Under the default \`auto\`
     a browser sizes each column to its content, so the box holding "18" comes
     out wider than the one holding "0" — MEASURED at 320px, two score
     controls side by side were 62.1px and 74.4px — and the whole planilla
     re-flows as the match fills it in, moving a box out from under the thumb
     already reaching for it. \`fixed\` settles every column from the
     \`<colgroup>\` before a single cell's content is measured. */
  table-layout: fixed;
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

/* THE ONE COLUMN WITH A WIDTH OF ITS OWN, declared on the \`<col>\` because
   that is the element a column's width belongs to. Under
   \`table-layout: fixed\` the widths are read off the FIRST ROW, and the row
   this table starts with begins at the blank corner cell — so a width
   declared on the category headers below is read one row too late and never
   applies at all. Measured rather than reasoned: written that way it clipped
   "Generala doble" by 5px at 320. */
.hexdev-generala-scorecard-labels {
  width: var(--generala-planilla-labels);
}

/* The category names: left-aligned like a printed planilla's, one line each. */
.hexdev-generala-scorecard-table th[scope="row"] {
  text-align: left;
  white-space: nowrap;
  font-weight: 400;
}

.hexdev-generala-scorecard-table thead th,
.hexdev-generala-scorecard-table tfoot th,
.hexdev-generala-scorecard-table tfoot td {
  font-weight: 700;
}

/* WHOSE TURN IT IS, on the surface every seat is already reading: the
   column darkens and its heading takes the accent. This file's header has
   the whole argument, including why the heading is not simply bolder. */
.hexdev-generala-scorecard-table [data-turn="active"] {
  background: var(--generala-planilla-turn);
}

.hexdev-generala-scorecard-table thead th[data-turn="active"] {
  color: var(--gx-color-accent, var(--hx-gold, #e8c877));
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
   sighted players get the notation, assistive tech gets the blank. Only
   where the box is EMPTY: an open box this seat may write carries a control
   with a number in it, and a dash beside the number would be the notation
   for "nothing here" printed on top of something.

   THE 0.5 IS THE ONE NUMBER HERE THAT COULD HIDE SOMETHING. Twenty-two of a
   fresh planilla's twenty-two boxes are open, so a full-contrast dash would
   out-shout the handful of numbers a player is actually reading; dimming it
   is what makes the card scan. MEASURED rather than assumed: against
   \`#f4efe2\` on the \`#14231d\` felt the scene renders on, the blended mark
   computed to 4.62:1 — above the 4.5:1 AA floor for text this size, with
   very little room under it — and that was a measurement on a STAND-IN,
   because the shipped background belonged to a board that did not exist.

   RE-MEASURED ON THE SHIPPED BOARD, which does exist now:
   \`board-styles.ts\` paints \`--gx-color-surface\` and its default is the same
   \`#14231d\`, so the stand-in was the real value all along. Sampled off the
   rendered board rather than computed — the darkest cell background reads
   \`rgb(20, 35, 29)\` and the brightest pixel of the blended dash reads
   \`rgb(131, 139, 136)\` — the mark computes to 4.67:1, against 14.57:1 for a
   written number in the same column. The floor holds, and the margin is
   still thin enough that a tenant darkening this token past its default is
   the one change that would break it. */
.hexdev-generala-scorecard-cell[data-state="open"]:empty::after {
  content: "—";
  opacity: 0.5;
}

/* THE OPEN BOX THIS SEAT MAY WRITE, and the highest-value affordance on the
   screen: it says what this roll would be worth here BEFORE the player
   commits to it. It fills its cell so the target is the whole box a finger
   aims at rather than the three characters inside it, and it is never
   shorter than the standard's 44px. Its WIDTH is its column's, which the
   fixed layout above is what settles. The cell's padding comes off so the two agree about where
   the box ends. */
.hexdev-generala-scorecard-cell:has(> .hexdev-generala-score) {
  padding: 0;
}

.hexdev-generala-score {
  appearance: none;
  /* NO \`display: block\` HERE, and its absence was measured rather than
     assumed. It is the reflex declaration for a button meant to fill
     something, and deleting it moved nothing: \`width: 100%\` on the only
     child of a zero-padding cell already gives the corner-for-corner box
     \`scorecard.browser.test.ts\` asserts, and a button is not laid out as
     ordinary inline content. Deleting \`width: 100%\` instead reds six cases,
     which is which of the two is doing the work. A clause with nothing to
     observe is not a free belt. */
  width: 100%;
  min-height: ${String(SCORE_TAP_MIN)}px;
  box-sizing: border-box;
  font: inherit;
  font-variant-numeric: tabular-nums;
  padding: 4px;
  border: 0;
  border-radius: 0;
  /* AND IT LOOKS LIKE SOMETHING YOU CAN PRESS, AT REST. Also found by
     looking: a preview and a box already written are both a bare number, so
     the column a player is choosing from was indistinguishable from the part
     of it already spent — and on a touch screen there is no hover to reveal
     it. A lightness tint rather than a hue, so it survives being
     colour-blind, and the control it marks is a real \`<button>\` besides,
     so assistive tech never needed the cue at all. */
  background: rgba(255, 255, 255, 0.07);
  color: inherit;
  cursor: pointer;
}

.hexdev-generala-score:hover {
  background: var(--gx-color-accent, var(--hx-gold, #e8c877));
  color: var(--gx-color-on-primary, #14231d);
}

.hexdev-generala-score:focus-visible {
  outline: 3px solid var(--generala-focus-ring, #2563eb);
  outline-offset: -3px;
}

/* A BOX CROSSED AT ZERO IS STRUCK THROUGH, which is what crossing out IS at
   a real table — and it stopped being decoration the moment previews
   arrived. FOUND BY LOOKING: an open box worth 0 with this roll and a box
   somebody spent at 0 both read "0", and eight of eleven boxes preview 0 on
   an ordinary roll, so a whole column of them sits beside the one that is
   gone for good. The strike is the notation that tells them apart, it is not
   a colour (WCAG 1.4.1), and it keeps full contrast because a spent category
   is exactly what a rival plans around. */
.hexdev-generala-scorecard-cell[data-state="crossed"] {
  text-decoration: line-through;
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
