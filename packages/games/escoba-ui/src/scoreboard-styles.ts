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

.hexdev-escoba-scoreboard-label {
  font-size: 0.85em;
  opacity: 0.8;
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

.hexdev-escoba-scoreboard-escobas {
  font-size: 0.8em;
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
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
