export const PILES_STYLE_ID = "hexdev-escoba-piles-styles";

/**
 * Both teams' capture piles, side by side. Container-query only, same rule
 * as table-styles.ts: an embedded widget's available width is its
 * container's, never the viewport's — no ResizeObserver/matchMedia/
 * innerWidth anywhere here. Cards inside one pile overlap in a fan
 * (negative margin) rather than wrapping like the table does: a pile is a
 * MEMORY of what a team captured, not a surface to read every card off at
 * once, so an overlapping stack that grows sideways reads better than a
 * dozen full-size cards competing with the table above it.
 */
export function buildPilesStylesheet(): string {
  return `
.hexdev-escoba-piles {
  container-type: inline-size;
  container-name: hexdev-escoba-piles;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--escoba-piles-gap, 16px);
  width: 100%;
  box-sizing: border-box;
  padding: var(--escoba-piles-padding, 8px);
  /* Same reasoning as table-styles.ts's own .hexdev-escoba-table: this is a
   * sibling container-query root under createEscobaRenderer's mount, not a
   * descendant of anything that already pins the host's font, so it pins its
   * own -- font-independence.browser.test.ts covers both. */
  font-family: var(--gx-font-family, system-ui, sans-serif);
}

.hexdev-escoba-pile {
  /* HALF THE LINE, MINUS HALF THE GAP — the room ONE pile may occupy so that
     BOTH always fit on a single row. There are exactly two piles, always
     (piles.ts: one per team, never one per player), so halving the line is a
     complete answer rather than an approximation. \`100cqw\` is the piles
     container's own CONTENT box, which is why the padding is not subtracted
     again here. Two pixels of honest slack, so a sub-pixel line width can
     never be the thing that breaks the row. */
  --escoba-pile-span: calc((100cqw - var(--escoba-piles-gap, 16px) - 2px) / 2);
  display: flex;
  /* NOWRAP, and it is the fan below that earns it: a pile can no longer
     out-grow its span, so there is nothing left to wrap. */
  flex-wrap: nowrap;
  min-width: 0;
}

.hexdev-escoba-pile-card {
  --escoba-pile-card-width: 40px;
  /* THE FAN TIGHTENS INSTEAD OF WRAPPING, and this is the fix for a real
     measured defect: the step used to be a CONSTANT 40% of a card, so a pile's
     width was a function of its CARD COUNT and of nothing else — it took no
     notice of the room it had. Two twenty-card piles ask for 344px each; the
     felt's piles line at 844x390 fullscreen is 660px wide (the 168px rail
     column is the rest), so 344 + 16 + 344 = 704 overflowed and the two piles
     wrapped onto two rows. The height cap in table-styles.ts then had to
     reserve BOTH rows, and a rotated phone paid for it in card size.

     So the step is the smaller of what the fan WANTS and what the row can
     AFFORD: (span - one whole card) spread over the gaps between the cards.
     --escoba-pile-count is the pile's own card count, set by piles.ts. Below
     ~19 cards a pile the first term still wins and the fan looks exactly as it
     always did; past it the cards simply slide further under each other. The
     2px floor is for a container too narrow to hold even one card, where the
     second term goes negative. */
  --escoba-pile-step: max(2px, min(var(--escoba-pile-card-width) * 0.4, (var(--escoba-pile-span) - var(--escoba-pile-card-width)) / max(1, var(--escoba-pile-count, 1) - 1)));
  flex: 0 0 auto;
  width: var(--escoba-pile-card-width);
  margin-left: calc(var(--escoba-pile-step) - var(--escoba-pile-card-width));
}

.hexdev-escoba-pile-card:first-child {
  margin-left: 0;
}

/* The art's real 329x520, declared rather than waited for -- table-styles.ts's
   own img rule carries the argument in full: the width/height ATTRIBUTES
   spanish-deck-ui stamps are the logical 220x336 box, a ratio 3.5% apart from
   the file's, so an undeclared card is laid out short and then grows when its
   bytes land. A pile is forty cards deep by the end of a hand and its band is
   budgeted to the pixel, so it is the last row that should be measuring one
   height before decode and another after. Literals here rather than
   table-styles.ts's --escoba-art-*: a pile card is not a .hexdev-escoba-card
   and inherits none of its properties. */
.hexdev-escoba-pile-card img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 329 / 520;
  object-fit: contain;
}

@container hexdev-escoba-piles (width < 400px) {
  .hexdev-escoba-pile-card { --escoba-pile-card-width: 28px; }
  .hexdev-escoba-piles { gap: 8px; }
}
`;
}

/** Injects the stylesheet at most once per document — same idempotence as
 * table-styles.ts's own ensureTableStyles. */
export function ensurePilesStyles(doc: Document): void {
  if (doc.getElementById(PILES_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = PILES_STYLE_ID;
  style.textContent = buildPilesStylesheet();
  doc.head.appendChild(style);
}
