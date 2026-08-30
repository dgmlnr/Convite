export const SCOREBOARD_STYLE_ID = "hexdev-escoba-scoreboard-styles";

/**
 * The running scoreboard and the hand-end breakdown (slice R1). Container-
 * query only, same rule as table-styles.ts/piles-styles.ts: an embedded
 * widget's available width is its container's, never the viewport's — no
 * ResizeObserver/matchMedia/innerWidth anywhere here.
 */
export function buildScoreboardStylesheet(): string {
  return `
.hexdev-escoba-scoreboard {
  container-type: inline-size;
  container-name: hexdev-escoba-scoreboard;
  display: flex;
  justify-content: center;
  gap: var(--escoba-scoreboard-gap, 24px);
  width: 100%;
  box-sizing: border-box;
  padding: var(--escoba-scoreboard-padding, 8px);
  /* Sibling container-query root under createEscobaRenderer's mount, not a
   * descendant of anything that already pins the host's font -- it pins its
   * own, same lesson as table-styles.ts/piles-styles.ts (slice Q). */
  font-family: var(--gx-font-family, system-ui, sans-serif);
}

.hexdev-escoba-scoreboard-team {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

/* THE TEAM'S NAME, in the platform's own label voice: small, uppercase,
   tracked out, and gold. Byte for byte the treatment truco-ui gives
   .hexdev-truco-team-label — re-declared rather than imported, because
   escoba-ui is L1 and reaches no further than spanish-deck-ui. It replaces a
   dimmed 0.85em line, which read as a caption someone forgot to finish. */
.hexdev-escoba-scoreboard-label {
  font-size: var(--hx-text-meta, 0.75rem);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--hx-tracking-label, 0.08em);
  color: var(--gx-color-accent, var(--hx-gold, #e8c877));
}

/* THE SCORE AND THIS HAND'S ESCOBAS SHARE ONE ROW. Stacked, the escobas count
   spent a whole line of a phone screen saying "Escobas: 0" for most of most
   hands, and the first escoba of a hand grew the scoreboard and pushed the
   cards down. Baseline-aligned so two different type sizes still sit on one
   line rather than looking like a heading and a caption. */
.hexdev-escoba-scoreboard-tally {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.hexdev-escoba-scoreboard-score {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* THIS HAND'S ESCOBAS, AS ART. 14.1 MARKS THEM — one face-up card per
   escoba, laid ACROSS the pile (scoreboard.ts carries the regulation).

   ZERO COSTS THE SAME AS ONE, which is the property that lets this live on
   the score's own row at all: the box reserves a mark's height whether or not
   there is a mark in it, and it is centred rather than baseline-aligned, so
   the first escoba of a hand appears INSIDE a row that was already that tall.
   Nothing below it moves. min-height is deliberately under the score's own
   line box, so the row's height is still the score's and this never grows it.

   flex-wrap because a hand can hold several: at 168px of rail column four
   marks and a score share the row, and the fifth drops under them rather than
   pushing the score off its edge. */
.hexdev-escoba-scoreboard-escobas {
  display: flex;
  align-self: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px;
  min-height: var(--escoba-mark-height, 19px);
}

/* A CARD SEEN FACE UP AND SIDEWAYS: 520/329 is the deck art's own ratio, laid
   on its side, so the mark is the shape of a real card lying across a pile
   rather than a generic chip. Ivory face, gold filet, one contact shadow —
   the three things that make it read as a card and not as a highlight. */
.hexdev-escoba-escoba-mark {
  flex: 0 0 auto;
  height: var(--escoba-mark-height, 19px);
  width: calc(var(--escoba-mark-height, 19px) * 520 / 329);
  border-radius: 2px;
  /* Ivory face, gold filet, and the deck's own inner frame one pixel further
     in -- that third line is what stops a 15px rectangle reading as a blank
     chip, because an inner frame is the one thing every card in this deck has
     and no counter, pill or badge on this screen does. */
  background: linear-gradient(160deg, #fdf7e8, #e6d9bd);
  box-shadow: var(--hx-elev-1), inset 0 0 0 1px var(--hx-gold-edge, #b8923f), inset 0 0 0 3px rgba(253, 247, 232, 0.95), inset 0 0 0 4px rgba(184, 146, 63, 0.55);
  /* LAID ACROSS, not filed in a row. Square to the score these read as a
     progress meter; a few degrees off and they read as what they are, cards
     dropped sideways onto a pile as the baza was gathered. */
  transform: rotate(-7deg);
}

/* Said, not drawn — same bargain, same recipe, as .hexdev-escoba-seat-count
   one stylesheet over. Kept as its own rule rather than a shared utility
   because each is half of a "picture plus its sentence" pair that lives and
   dies with the component around it. */
.hexdev-escoba-escoba-count {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.hexdev-escoba-hand-breakdown {
  container-type: inline-size;
  container-name: hexdev-escoba-hand-breakdown;
  width: 100%;
  box-sizing: border-box;
  padding: var(--escoba-breakdown-padding, 8px);
  font-family: var(--gx-font-family, system-ui, sans-serif);
}

.hexdev-escoba-hand-breakdown:not([data-decided]) {
  display: none;
}

.hexdev-escoba-hand-breakdown-row,
.hexdev-escoba-hand-breakdown-total {
  margin: 0 0 4px;
}

.hexdev-escoba-hand-breakdown-total {
  font-weight: 700;
}

@container hexdev-escoba-scoreboard (width < 400px) {
  .hexdev-escoba-scoreboard { gap: 12px; }
}
`;
}

/** Injects the stylesheet at most once per document — same idempotence as
 * table-styles.ts/piles-styles.ts's own ensure* functions. */
export function ensureScoreboardStyles(doc: Document): void {
  if (doc.getElementById(SCOREBOARD_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = SCOREBOARD_STYLE_ID;
  style.textContent = buildScoreboardStylesheet();
  doc.head.appendChild(style);
}
