export { renderEscobaTable } from "./table.js";
export type { TableInteraction } from "./table.js";
// buildTableStylesheet/buildPilesStylesheet stay unexported from this barrel
// -- unlike truco-ui's identically-named function, nothing outside their own
// file ever calls them (ensureTableStyles/ensurePilesStyles, below, are the
// public entry point); a public export with zero consumers is exactly
// patrones/borrar-el-mecanismo-no-solo-el-consumidor's own shape.
//
// `buildMatchStylesheet` is the ONE exception, and it has a named reader:
// design-token-parity.test.ts scans its declared block, exactly as it already
// scans truco-ui's own exported `buildTableStylesheet`. That guard is what
// keeps the felt's third literal copy of the shared values from drifting.
export { ensureTableStyles, TABLE_STYLE_ID } from "./table-styles.js";
export { renderEscobaPiles } from "./piles.js";
export type { TeamIdentity } from "./piles.js";
export { ensurePilesStyles, PILES_STYLE_ID } from "./piles-styles.js";
export { createMarkThenPlay } from "./mark-then-play.js";
export type { MarkThenPlayElements } from "./mark-then-play.js";
export { describeHandBreakdown, renderEscobaHandBreakdown, renderEscobaScoreboard } from "./scoreboard.js";
export type { TeamScore } from "./scoreboard.js";
export { ensureScoreboardStyles, SCOREBOARD_STYLE_ID } from "./scoreboard-styles.js";
export { renderEscobaStatus } from "./status.js";
export type { EscobaStatusElements, SeatRole } from "./status.js";
export { ensureStatusStyles, STATUS_STYLE_ID } from "./status-styles.js";
export { describeMatchOutcome, renderMatchOverOverlay } from "./match-outcome.js";
export type { MatchOutcomeInfo, MatchOverProps } from "./match-outcome.js";
export { ensureMatchOverStyles, MATCH_OVER_STYLE_ID } from "./match-over-styles.js";
export { buildMatchStylesheet, ensureMatchStyles, MATCH_STYLE_ID } from "./match-styles.js";
