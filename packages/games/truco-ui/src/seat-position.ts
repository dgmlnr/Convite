/**
 * A screen anchor on the game table. The table is designed for four seats
 * from day one even though v1 only ever seats two (obs 2970: same
 * team-shaped-from-the-start asymmetry as the engine) — building a two-anchor
 * layout now would mean rebuilding, not extending, once 2v2 ships.
 */
export type TableAnchor = "bottom" | "top" | "left" | "right";

/** Clockwise starting at the local player's own seat — the order every
 * caller should iterate positions in for a stable, predictable render. */
export const ANCHOR_ORDER: readonly TableAnchor[] = ["bottom", "right", "top", "left"];

export interface SeatPositionInput {
  /** The LOCAL player's own seat, as returned on `PlayerView.self.seat`. */
  readonly mySeat: number;
  readonly seatCount: number;
}

/**
 * Maps every seat in the match to a screen anchor, always relative to the
 * local player: `mySeat` itself is always `'bottom'` (obs 2970: "vos siempre
 * estás abajo, sin importar qué asiento te tocó"). This single rotation is
 * what lets a 2-seat and a future 4-seat match share one table layout — the
 * anchors never change, only which engine seat lands on which anchor.
 *
 * In the 4-seat (2v2) shape, the partner sits at the seat two positions away
 * (`mySeat + 2`), which lands opposite at `'top'`, and the two opponents take
 * the side anchors — exactly the arrangement obs 2970 describes.
 */
export function resolveSeatPositions(input: SeatPositionInput): ReadonlyMap<number, TableAnchor> {
  const { mySeat, seatCount } = input;
  // Only 2 (v1) and 4 (v2/2v2) are real shapes this engine ever produces
  // (design §1's team model), so the offset is spread evenly around the four
  // anchors: a 2-seat match uses every OTHER anchor (bottom, top), a 4-seat
  // match uses all four in clockwise order.
  const step = ANCHOR_ORDER.length / seatCount;
  const positions = new Map<number, TableAnchor>();
  for (let seat = 0; seat < seatCount; seat += 1) {
    const offset = (seat - mySeat + seatCount) % seatCount;
    const anchor = ANCHOR_ORDER[(offset * step) % ANCHOR_ORDER.length]!;
    positions.set(seat, anchor);
  }
  return positions;
}
