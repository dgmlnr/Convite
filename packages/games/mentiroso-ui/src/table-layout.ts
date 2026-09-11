/**
 * Seat layout for the mentiroso table (design D5), and the reason it is
 * POLAR rather than ported from `truco-ui/seat-position.ts`'s four fixed
 * anchors (`ANCHOR_ORDER = ["bottom", "right", "top", "left"]`).
 *
 * `resolveSeatPositions` there computes `step = ANCHOR_ORDER.length /
 * seatCount` and indexes `ANCHOR_ORDER[(offset * step) % ANCHOR_ORDER.length]`.
 * That only lands on an integer index when `seatCount` divides 4 evenly — 1,
 * 2, and 4 seats. Mentiroso registers 2, 4, AND 6 (`mentiroso-module`'s three
 * `GameModule`s), and at 6, `step` is 4/6 ≈ 0.667: a non-integer array index
 * reads back `undefined` rather than throwing, so the ported scheme fails
 * SILENTLY, not loudly. `table-layout.test.ts`'s own negative control proves
 * this by running truco's real, unmodified function at seatCount=6.
 *
 * A four-anchor scheme cannot be adapted around this: it has no divisibility
 * story for 6 at all. Equal angular spacing over an ARBITRARY seat count has
 * no fixed number of anchors to name, so this module never names one either
 * — every seat's angle is computed directly from its offset from the
 * viewer's own seat.
 */

export interface SeatPosition {
  /** The engine seat this position belongs to. */
  readonly seat: number;
  /**
   * Degrees clockwise from the viewer's own seat, which always sits at 0°
   * (the bottom reference position — obs 2970's "vos siempre estás abajo",
   * the same invariant `truco-ui/seat-position.ts` states for its own four
   * anchors). Always in the half-open range `[0, 360)`.
   */
  readonly angleDeg: number;
  /**
   * Horizontal offset from the table's center, on a unit circle (positive is
   * to the viewer's right). A caller renders this by scaling both `x` and
   * `y` by whatever radii make the table read as an ellipse rather than a
   * circle (design D5: "around an ellipse") — that scaling is a rendering
   * concern for a later unit (`cups.ts`), not a geometry one, so this module
   * stays on the unit circle rather than baking in radii nobody has chosen
   * yet.
   */
  readonly x: number;
  /**
   * Vertical offset from the table's center, on a unit circle. Positive is
   * toward the bottom of the screen (CSS's own y-down convention), so the
   * viewer's own seat — always at angle 0 — always has `y === 1`.
   */
  readonly y: number;
}

/**
 * The seat's offset from the viewer's own seat, walking forward
 * (clockwise) around the table: 0 for the viewer's own seat, 1 for the next
 * seat, and so on up to `seatCount - 1`. Every seat from 0 to `seatCount - 1`
 * maps to a DISTINCT offset in this range — a bijection over the full seat
 * set, never a partial one — which is what makes the angular-gap and
 * distinctness guarantees below hold for any `seatCount`, not just the ones
 * a fixed-anchor scheme happens to divide evenly.
 */
function offsetFromMySeat(seat: number, mySeat: number, seatCount: number): number {
  return ((seat - mySeat) % seatCount + seatCount) % seatCount;
}

/**
 * The position of a single `seat` at a table of `seatCount` seats, relative
 * to the viewer occupying `mySeat` (design D5's `positionFor(seat, mySeat,
 * seatCount)`).
 *
 * Equal angular spacing (spec "Seat positions MUST be spaced at equal
 * angles"): `offsetFromMySeat` is a bijection over `[0, seatCount)`, so the
 * `seatCount` angles produced across every seat are exactly `0,
 * 360/seatCount, 2·360/seatCount, …` — evenly spaced by construction, for
 * ANY seatCount, not only ones a fixed set of anchors happens to divide.
 *
 * Own seat at bottom (spec "The viewing player's own seat MUST always render
 * at the bottom reference position"): `seat === mySeat` gives offset 0,
 * angle 0°, and `(x, y) = (sin 0, cos 0) = (0, 1)` — the bottom of the unit
 * circle in CSS's y-down convention — regardless of which seat number the
 * engine assigned the viewer.
 *
 * Table layout MUST NOT re-flow when a seat is eliminated (spec
 * R-TABLE-STABLE): this function takes no elimination/dice-count input at
 * all, so a seat's position cannot change when it is eliminated — there is
 * no state here for elimination to change. (The visual proof of this lives
 * in the E5 baselines; this is the structural reason it holds.)
 */
export function positionFor(seat: number, mySeat: number, seatCount: number): SeatPosition {
  if (!Number.isInteger(seatCount) || seatCount <= 0) {
    throw new Error(`positionFor: seatCount must be a positive integer, got ${String(seatCount)}`);
  }
  const offset = offsetFromMySeat(seat, mySeat, seatCount);
  const angleDeg = (offset * 360) / seatCount;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    seat,
    angleDeg,
    x: Math.sin(angleRad),
    y: Math.cos(angleRad),
  };
}

/**
 * Every seat's position at a table of `seatCount` seats, relative to the
 * viewer occupying `mySeat` — one entry per seat, in seat-number order
 * (spec "Table layout MUST render exactly one position per registered
 * seat").
 */
export function tableLayout(mySeat: number, seatCount: number): readonly SeatPosition[] {
  return Array.from({ length: seatCount }, (_unused, seat) => positionFor(seat, mySeat, seatCount));
}
