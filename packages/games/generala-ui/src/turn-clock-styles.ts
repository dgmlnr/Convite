export const TURN_CLOCK_STYLE_ID = "hexdev-generala-turn-clock-styles";

/**
 * THE STRIP THE TURN CLOCK IS DRAWN ON.
 *
 * NON-INVASIVE, WHICH IS A CONSTRAINT AND NOT A PREFERENCE. Every other cue
 * this board gives about whose turn it is — the darkened planilla column, the
 * dimmed tray — is deliberately quiet, and a countdown is the one that would
 * most easily stop being: it is the only thing on the screen that MOVES on its
 * own. So it is one line of small text, above the card it belongs beside, and
 * it borrows the vocabulary the planilla already uses rather than inventing a
 * badge.
 *
 * ONE CELL PER SEAT, IN SEAT ORDER, which is the planilla's own column order
 * (`scorecard.ts`'s `seatsInOrder`, shared). Equal widths rather than the
 * table's 44/28/28: aligning the two surfaces would mean reading
 * `--generala-planilla-labels` from a SIBLING subtree, where it is not
 * inherited, and copying its value here would be a second declaration of one
 * number with nothing to keep the two together.
 *
 * THE COLUMN ON TURN IS DARKENED, AND THE DIRECTION IS BORROWED FROM A
 * MEASUREMENT. `scorecard-styles.ts` carries the arithmetic: on this board's
 * `#14231d` every white tint visible at all takes the planilla's open-box dash
 * under the AA floor, so the mark for "this one" had to go the other way.
 * Nothing here is drawn at that dash's weight, but a board with two "on turn"
 * marks pointing in opposite directions would be worse than either, so this
 * one darkens too — and `chrome-contrast.browser.test.ts` measures it on the
 * real ground rather than trusting the borrowing.
 */
export function buildTurnClockStylesheet(): string {
  return `
.hexdev-generala-turn-clock {
  /* Declared, not only read: \`--generala-\` is a namespace this package owns
     (\`stylesheet-tokens.test.ts\`), and this is a real knob — a board that
     repainted its surface would have to move it. The value is the planilla's
     own, arrived at the same way and kept separate on purpose: two surfaces
     may want two answers, and neither can read the other's declaration. */
  --generala-clock-turn: rgba(0, 0, 0, 0.3);
  position: relative;
  width: 100%;
  font-family: var(--gx-font-family, system-ui, sans-serif);
  color: inherit;
}

.hexdev-generala-turn-clock-row {
  display: flex;
  /* FOUND BY LOOKING: at 6px the lit cell's number sat almost against the next
     seat's name and "0:47 Rival" read as one phrase. The cells are pinned to
     their own outer edges, so this is the only thing separating two of them. */
  gap: 16px;
}

.hexdev-generala-turn-clock-seat {
  flex: 1 1 0;
  display: flex;
  align-items: baseline;
  /* THE NAME IS PINNED TO ONE EDGE, WHICH IS THE WHOLE OF "NOTHING MOVES".
     Centring the pair was the first draft and it slides: the time collapses
     to nothing between turns, the pair re-centres, and the seat's name steps
     sideways at the start of every turn and back again at the end of it.
     Reserving a width for the time was the second draft, and it MEASURED
     WRONG — "1:00" came out 1.25px wider than the 4ch reserved for it, so the
     name still moved, just less, and the fence meant to catch that was
     measuring the CELL, whose width \`flex: 1 1 0\` had already settled. This
     is a mechanism instead of a number: whatever the time is or is not, the
     name's edge is the cell's. */
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  /* The line box is pinned rather than left to the font, so the strip is the
     same height on every machine and adding it to the board moves nothing
     below it by a fraction of a pixel. */
  line-height: 1.4;
}

/* WHOSE TURN IT IS, in the planilla's own two marks: the ground darkens and
   the name takes the accent. */
.hexdev-generala-turn-clock-seat[data-turn="active"] {
  background: var(--generala-clock-turn);
}

.hexdev-generala-turn-clock-seat[data-turn="active"] .hexdev-generala-turn-clock-name {
  color: var(--gx-color-accent, var(--hx-gold, #e8c877));
  font-weight: 700;
}

/* THE NUMBER, ANCHORED TO THE FAR EDGE by the rule above. Tabular digits are
   what keep "1:00" and "0:59" the same width, so the one thing on this board
   that changes every second changes nothing about the layout. */
.hexdev-generala-turn-clock-time {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
`;
}

/** Injects the stylesheet at most once per document — the same idempotence
 * guard every `ensure*` helper in this package uses, so a board rendered on
 * every message never duplicates the `<style>` tag. */
export function ensureTurnClockStyles(doc: Document): void {
  if (doc.getElementById(TURN_CLOCK_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = TURN_CLOCK_STYLE_ID;
  style.textContent = buildTurnClockStylesheet();
  doc.head.appendChild(style);
}
