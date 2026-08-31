/**
 * The classic turtle, as DATA, with its provenance beside it.
 *
 * UNITS ARE HALF-TILES, and that is not our invention — it is what both
 * source encodings already are. A tile at `(x, y, z)` occupies the 2x2
 * half-cell footprint `x..x+1` by `y..y+1`. GNOME's own parser multiplies
 * every map coordinate by 2 and steps by 2 (`src/map.vala`, the `row`/
 * `column`/`block` cases); KMahjongg's file-format header declares its board
 * "in quarter tiles" with a 2x2 cell per tile. The half-cell grid is what
 * makes the turtle's two half-row arms representable at all — they sit at
 * `y = 7`, between the shell rows at `y = 6` and `y = 8` — with no special
 * case anywhere, which is the whole reason the coordinates are not whole
 * tiles.
 *
 * SOURCED, NEVER TYPED FROM MEMORY. The rows below were parsed out of two
 * independent open-source encodings and cross-checked against each other,
 * retrieved 2026-08-31:
 *
 *   A. GNOME/gnome-mahjongg, `data/maps/mahjongg.map`, `<map name="Turtle">`
 *      (GPL-2.0-or-later) — https://gitlab.gnome.org/GNOME/gnome-mahjongg
 *   B. KDE games/kmahjongg, `layouts/default.layout`
 *      (`kmahjongg-layout-v1.1`) — https://invent.kde.org/games/kmahjongg
 *
 * The two are IDENTICAL after normalising each to `min x = min y = 0`; B sits
 * +1 half-cell in x inside its own padded grid, and that translation is the
 * only difference. Zero disagreement on any of the 144 positions.
 *
 * Source A's declaration is reproduced here verbatim, so the expansion below
 * can be checked without leaving this file (its coordinates are whole tiles;
 * ours are those, doubled):
 *
 *     <map name="Turtle" scorename="easy">
 *       <layer z="0">
 *         <row y="0" left="1" right="12"/>
 *         <row y="1" left="3" right="10"/>
 *         <row y="2" left="2" right="11"/>
 *         <row y="3" left="1" right="12"/>
 *         <row y="4" left="1" right="12"/>
 *         <row y="5" left="2" right="11"/>
 *         <row y="6" left="3" right="10"/>
 *         <row y="7" left="1" right="12"/>
 *         <tile x="0" y="3.5"/>
 *         <row y="3.5" left="13" right="14"/>
 *       </layer>
 *       <block z="1" left="4" right="9" top="1" bottom="6"/>
 *       <block z="2" left="5" right="8" top="2" bottom="5"/>
 *       <block z="3" left="6" right="7" top="3" bottom="4"/>
 *       <tile z="4" x="6.5" y="3.5"/>
 *     </map>
 *
 * WHAT THE DATA MEASURES (all five verified by `layout.test.ts`, except where
 * noted): 144 distinct positions; 30 half-cells wide by 16 tall, i.e. **15
 * tile-columns by 8 tile-rows** — the widely repeated "12 wide" is the shell
 * body alone and forgets the three arm tiles; layers 0..4 holding 87 / 36 /
 * 16 / 4 / 1; 35 free positions on a full board. The per-layer counts and the
 * 35 are recorded here rather than asserted, for the reason `layout.test.ts`
 * gives at each invariant.
 */

/** `[z, y, ...xs]` — one declared half-cell row of the turtle. */
type HalfCellRow = readonly [z: number, y: number, ...xs: number[]];

/** A tile position in half-tile units; its footprint is `x..x+1` by `y..y+1`. */
export interface Position {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const TURTLE_ROWS: readonly HalfCellRow[] = [
  // layer 0 — 87 tiles: the eight shell rows (84) plus the three half-row arm
  // tiles at y = 7 (one left, two right)
  [0, 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
  [0, 2, 6, 8, 10, 12, 14, 16, 18, 20],
  [0, 4, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
  [0, 6, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
  [0, 7, 0, 26, 28],
  [0, 8, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
  [0, 10, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
  [0, 12, 6, 8, 10, 12, 14, 16, 18, 20],
  [0, 14, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],

  // layer 1 — 36 tiles
  [1, 2, 8, 10, 12, 14, 16, 18],
  [1, 4, 8, 10, 12, 14, 16, 18],
  [1, 6, 8, 10, 12, 14, 16, 18],
  [1, 8, 8, 10, 12, 14, 16, 18],
  [1, 10, 8, 10, 12, 14, 16, 18],
  [1, 12, 8, 10, 12, 14, 16, 18],

  // layer 2 — 16 tiles
  [2, 4, 10, 12, 14, 16],
  [2, 6, 10, 12, 14, 16],
  [2, 8, 10, 12, 14, 16],
  [2, 10, 10, 12, 14, 16],

  // layer 3 — 4 tiles
  [3, 6, 12, 14],
  [3, 8, 12, 14],

  // layer 4 — 1 tile, the apex, offset a half-cell in both directions
  [4, 7, 13],
];

/**
 * The 144 turtle positions, in a stable `(z, y, x)` ascending order. The order
 * is part of the contract: a position's INDEX in this array is how a board's
 * state addresses it, so re-ordering the rows re-labels every tile.
 */
export const LAYOUT: readonly Position[] = TURTLE_ROWS.flatMap(([z, y, ...xs]) => xs.map((x): Position => ({ x, y, z })));
