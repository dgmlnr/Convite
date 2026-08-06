// Positions for the repeated suit-symbol pips on numeral cards 1-7. This is
// the entire "composition" mechanism: a 5 de oros is not drawn, it is the
// oro symbol placed at these 5 coordinates.
export type NumeralRank = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface PipPosition {
  readonly x: number;
  readonly y: number;
}

const LEFT = 70;
const RIGHT = 150;
const CENTER = 110;
const TOP = 95;
const UPPER = 132;
const MID = 170;
const LOWER = 245;

export const PIP_LAYOUTS: Record<NumeralRank, readonly PipPosition[]> = {
  1: [{ x: CENTER, y: MID }],
  2: [
    { x: CENTER, y: TOP },
    { x: CENTER, y: LOWER },
  ],
  3: [
    { x: CENTER, y: TOP },
    { x: CENTER, y: MID },
    { x: CENTER, y: LOWER },
  ],
  4: [
    { x: LEFT, y: TOP },
    { x: RIGHT, y: TOP },
    { x: LEFT, y: LOWER },
    { x: RIGHT, y: LOWER },
  ],
  5: [
    { x: LEFT, y: TOP },
    { x: RIGHT, y: TOP },
    { x: CENTER, y: MID },
    { x: LEFT, y: LOWER },
    { x: RIGHT, y: LOWER },
  ],
  6: [
    { x: LEFT, y: TOP },
    { x: RIGHT, y: TOP },
    { x: LEFT, y: MID },
    { x: RIGHT, y: MID },
    { x: LEFT, y: LOWER },
    { x: RIGHT, y: LOWER },
  ],
  7: [
    { x: LEFT, y: TOP },
    { x: RIGHT, y: TOP },
    { x: CENTER, y: UPPER },
    { x: LEFT, y: MID },
    { x: RIGHT, y: MID },
    { x: LEFT, y: LOWER },
    { x: RIGHT, y: LOWER },
  ],
};

// The pip icon's own local box is 100x100; this is how much it is scaled down
// when placed at a PIP_LAYOUTS position (1 is drawn larger, as a single pip
// carries the whole card's identity).
export function pipScaleForRank(rank: NumeralRank): number {
  return rank === 1 ? 0.62 : 0.42;
}
