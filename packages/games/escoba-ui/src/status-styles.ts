export const STATUS_STYLE_ID = "hexdev-escoba-status-styles";

/**
 * The turn line and the row of other seats (slice R3a).
 *
 * Container-query only, same rule as table-styles.ts/piles-styles.ts/
 * scoreboard-styles.ts: an embedded widget's available width is its
 * container's, never the viewport's — no ResizeObserver/matchMedia/
 * innerWidth anywhere here. Each block is a sibling container-query root
 * under createEscobaRenderer's mount rather than a descendant of anything
 * that already pins the host's font, so it pins its own (slice Q).
 *
 * NO --hx-* TOKEN IS DECLARED HERE. This package's only felt tokens live in
 * match-styles.ts, where design-token-parity.test.ts scans them and rejects a
 * private name; everything tunable below is an --escoba-* custom property,
 * the same vocabulary piles-styles.ts and scoreboard-styles.ts already use.
 *
 * COLOUR IS NEVER THE MESSAGE (WCAG 1.4.1). The active seat gets an outline
 * and the local player's turn gets a ring, but both only repeat what the turn
 * line already says in words one row above.
 */
export function buildStatusStylesheet(): string {
  return `
.hexdev-escoba-status {
  container-type: inline-size;
  container-name: hexdev-escoba-status;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: var(--escoba-status-gap, 12px);
  width: 100%;
  box-sizing: border-box;
  padding: var(--escoba-status-padding, 4px 8px);
  font-family: var(--gx-font-family, system-ui, sans-serif);
}

.hexdev-escoba-turn {
  margin: 0;
  font-weight: 700;
}

.hexdev-escoba-turn[data-self="true"] {
  padding: 1px 10px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px currentColor;
}

/* Between hands there is no turn to report, so the line collapses instead of
   leaving an empty box holding vertical space -- the same :empty convention
   renderEscobaHandBreakdown already relies on. */
.hexdev-escoba-turn:empty {
  display: none;
}

.hexdev-escoba-seats {
  container-type: inline-size;
  container-name: hexdev-escoba-seats;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--escoba-seats-gap, 8px);
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: var(--escoba-seats-padding, 2px 8px);
  list-style: none;
  font-family: var(--gx-font-family, system-ui, sans-serif);
}

.hexdev-escoba-seat {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  font-size: 0.85em;
}

.hexdev-escoba-seat[data-turn="true"] {
  box-shadow: inset 0 0 0 2px currentColor;
}

.hexdev-escoba-seat-count {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

@container hexdev-escoba-seats (width < 400px) {
  .hexdev-escoba-seats { gap: 6px; }
  .hexdev-escoba-seat { gap: 4px; padding: 2px 6px; font-size: 0.76em; }
}
`;
}

/** Injects the stylesheet at most once per document — same idempotence as
 * every other ensure* helper in this package. */
export function ensureStatusStyles(doc: Document): void {
  if (doc.getElementById(STATUS_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = STATUS_STYLE_ID;
  style.textContent = buildStatusStylesheet();
  doc.head.appendChild(style);
}
