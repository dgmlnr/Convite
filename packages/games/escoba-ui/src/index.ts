export { renderEscobaTable } from "./table.js";
export type { TableInteraction } from "./table.js";
// buildTableStylesheet/buildPilesStylesheet stay unexported from this barrel
// -- unlike truco-ui's identically-named function, nothing outside their own
// file ever calls them (ensureTableStyles/ensurePilesStyles, below, are the
// public entry point); a public export with zero consumers is exactly
// patrones/borrar-el-mecanismo-no-solo-el-consumidor's own shape.
export { ensureTableStyles, TABLE_STYLE_ID } from "./table-styles.js";
export { renderEscobaPiles } from "./piles.js";
export type { TeamIdentity } from "./piles.js";
export { ensurePilesStyles, PILES_STYLE_ID } from "./piles-styles.js";
export { createMarkThenPlay } from "./mark-then-play.js";
export type { MarkThenPlayElements } from "./mark-then-play.js";
