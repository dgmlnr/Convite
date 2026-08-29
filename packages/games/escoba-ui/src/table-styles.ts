export const TABLE_STYLE_ID = "hexdev-escoba-table-styles";

/**
 * The face-up table's own stylesheet, generated as a string (not a .css
 * file) for the same reason truco-ui's table-styles.ts is: this package
 * builds via plain tsc -b, with no bundler to resolve a stylesheet import.
 * Injected once via ensureTableStyles.
 *
 * Container-query only, per this project's own rule: an embedded widget's
 * available width is its container's, never the viewport's, so no
 * ResizeObserver/matchMedia/innerWidth may appear here. flex-wrap is the
 * actual containment mechanism against the 20-card structural ceiling
 * (escoba/invariante-de-paridad-de-la-mesa) -- a fixed column count sized
 * for the common 3-8 card case is exactly the failure this guards against;
 * a card's own width shrinks at narrower container widths so more of them
 * still read comfortably per row, but wrapping alone is what keeps every
 * card inside the container regardless of count.
 */
export function buildTableStylesheet(): string {
  return `
.hexdev-escoba-table {
  container-type: inline-size;
  container-name: hexdev-escoba-table;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  justify-content: center;
  gap: var(--escoba-card-gap, 6px);
  width: 100%;
  box-sizing: border-box;
  padding: var(--escoba-table-padding, 8px);
}

.hexdev-escoba-card {
  --escoba-card-width: 72px;
  flex: 0 0 auto;
  width: var(--escoba-card-width);
}

.hexdev-escoba-card img {
  display: block;
  width: 100%;
  height: auto;
}

@container hexdev-escoba-table (width < 400px) {
  .hexdev-escoba-card { --escoba-card-width: 44px; }
  .hexdev-escoba-table { gap: 4px; }
}

@container hexdev-escoba-table (min-width: 400px) and (width < 640px) {
  .hexdev-escoba-card { --escoba-card-width: 56px; }
}
`;
}

/** Injects the stylesheet at most once per document -- same idempotence as
 * truco-ui's own ensureTableStyles, so re-mounting the table in a test never
 * duplicates the <style> element. */
export function ensureTableStyles(doc: Document): void {
  if (doc.getElementById(TABLE_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = TABLE_STYLE_ID;
  style.textContent = buildTableStylesheet();
  doc.head.appendChild(style);
}
