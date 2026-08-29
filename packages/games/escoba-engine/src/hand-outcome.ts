import type { TeamId } from "./ids.js";

/**
 * One of the five per-hand scoring categories (art. 8.1), reduced to who won
 * it. `winner: null` means NOBODY scored the category — a genuine outcome
 * (art. 17.1's tie generalization for cartas/oros/setenta), never "unknown"
 * or "not yet computed". A category that nobody won must still read as
 * "nobody won it", not be absent from the breakdown.
 */
export interface HandCategoryResult {
  readonly winner: TeamId | null;
}

/**
 * The hand-end breakdown a player-facing UI needs to explain a score change
 * honestly (slice R1): which side took each of cartas/oros/setenta/siete de
 * oro, plus the escoba tally and the resulting per-team point total. Every
 * field here is READ from `scoring.ts`'s own per-category comparators —
 * never re-derived — so this breakdown and `scoreHand`'s aggregate can never
 * drift apart (see `scoreHandBreakdown` in `scoring.ts`).
 */
export interface HandScoreBreakdown {
  readonly cartas: HandCategoryResult;
  readonly oros: HandCategoryResult;
  readonly setenta: HandCategoryResult;
  readonly sieteDeOro: HandCategoryResult;
  readonly escobas: Readonly<Record<TeamId, number>>;
  readonly points: Readonly<Record<TeamId, number>>;
}

/**
 * Whether the current hand has been scored yet, and — once it has — the full
 * breakdown behind the points it awarded. Isolated in its own file (mirrors
 * `truco-engine/src/hand-winner.ts`'s own split from `match.ts`) so
 * `state.ts` and `scoring.ts` can both depend on this shape without either
 * importing the other.
 */
export type HandOutcome = { readonly decided: false } | { readonly decided: true; readonly breakdown: HandScoreBreakdown };
