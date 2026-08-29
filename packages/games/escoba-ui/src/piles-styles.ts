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
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  min-width: var(--escoba-pile-card-width, 40px);
}

.hexdev-escoba-pile-card {
  --escoba-pile-card-width: 40px;
  flex: 0 0 auto;
  width: var(--escoba-pile-card-width);
  margin-left: calc(-1 * var(--escoba-pile-card-width) * 0.6);
}

.hexdev-escoba-pile-card:first-child {
  margin-left: 0;
}

.hexdev-escoba-pile-card img {
  display: block;
  width: 100%;
  height: auto;
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
