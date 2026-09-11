/**
 * The tilted table (SDD `mentiroso`, work unit E5b/task 5.6, owner decision
 * after E5's rendered baselines).
 *
 * THE PROBLEM, MEASURED BY LOOKING (E5's own three committed baselines,
 * rendered and viewed before this unit started): the cup reads as a roughly
 * ten-pixel smudge at every registered seat count, including two, where
 * `cups.ts`'s own `SEAT_FRAGMENT_SCALE` (0.32, calibrated against the SIX-seat
 * worst case) leaves no crowding to justify shrinking it that far.
 *
 * THE OWNER'S DIRECTION, VERBATIM: "que la perspectiva sea un poco inclinada,
 * no mucho pero lo suficiente para que se distinga el cubilete y se vean los
 * dados debajo con sus numeros bien legibles." Legibility of the die faces is
 * the hard limit, not a nice-to-have — tilt far enough and the pips
 * foreshorten into mush.
 *
 * HOW THE ANGLE WAS CHOSEN — RENDERED, NOT GUESSED. A throwaway scene
 * (`tilt-study.scene.test.ts`, deleted before this unit's PR) rendered the
 * real `@hexdev/dice-ui` cup+tray fragment, unmodified, at six candidate
 * angles (0/10/18/25/35/45deg, all at this same `TABLE_TILT_PERSPECTIVE_PX`)
 * in two views: the cup alone at 3x native size (does it read as a cup?) and
 * a full five-die roll at 1x (are the pips still individually countable?).
 * MEASURED FROM THAT RENDER, viewed directly:
 *
 *   - 0-10deg: the cup's own opening barely widens over its resting pose;
 *     every die face stays a near-perfect square, pips unmistakable.
 *   - 18deg: the cup's opening is CLEARLY wider (more green interior
 *     visible through the mouth — the exact "se distinga el cubilete" the
 *     owner asked for) while every die face is still a clearly countable
 *     square-ish rectangle, no pip ambiguous.
 *   - 25deg: dice are visibly flattening into wide rectangles; still
 *     countable, but the margin above 18deg is real and shrinking.
 *   - 35-45deg: dice compress into thin bars — pips blur together and stop
 *     being reliably countable at a glance. This is the failure the hard
 *     constraint names.
 *
 * `18deg` is the chosen angle: the clearest visible jump in "does the cup
 * read as a cup" over the 0-10deg range, with dice still comfortably inside
 * the legible zone (25deg is where that margin starts closing, not 18).
 *
 * WHAT THE TILT BUYS FOR FREE — CHECKED, NOT ASSUMED. `depthScaleFor` turns
 * table-layout.ts's own unit-circle `y` (+1 = the viewer's own seat, at the
 * bottom; -1 = the farthest seat) into a real perspective-projection
 * enlargement: the SAME `perspective / (perspective - z)` arithmetic
 * `dice-ui/dice-styles.ts`'s own comment already derives for its resting cube
 * ("480 / (480 - 50)"), applied here to a seat's own depth instead of a die's
 * own rotation. A seat nearer the viewer sits closer to the (implied) camera
 * once the table tilts back by `TABLE_TILT_DEG`, and a real perspective
 * camera draws whatever is closer BIGGER — no seat-count-specific formula
 * needed, the same reason `table-layout.ts` itself needs none: this is a
 * function of `y` alone, continuous over ANY seat count.
 *
 * `TABLE_DEPTH_RADIUS_PX` is `table-styles.ts`'s own felt height (800px)
 * times `cups.ts`'s own ellipse Y-radius (36%) — the actual vertical
 * distance between the nearest and farthest seat on the real felt, not a
 * separately chosen number that could quietly drift from either of those.
 */

/** The felt's own real height (`table-styles.ts`'s `FELT_HEIGHT_PX`),
 * restated here rather than imported: importing it would route through
 * `table-styles.ts`, which has no reason to depend on this file, and this
 * module has no reason to depend on it either — the two numbers are read
 * together in this docblock instead, the same "declared beside" convention
 * `cups.ts`'s own `STATUS_LABEL_FONT_SIZE_PX` already uses for a pair of
 * numbers that only make sense together. */
const FELT_HEIGHT_PX = 800;
/** `cups.ts`'s own `TABLE_RADIUS_Y_PERCENT`, restated for the same reason. */
const TABLE_RADIUS_Y_PERCENT = 36;

/** How far a seat's own depth swings between nearest (`y=1`) and farthest
 * (`y=-1`) on the real felt, in pixels — the actual vertical half-span of
 * the ellipse `cups.ts` draws seats around, not a separately chosen number. */
export const TABLE_DEPTH_RADIUS_PX = FELT_HEIGHT_PX * (TABLE_RADIUS_Y_PERCENT / 100);

/** MEASURED by rendering `tilt-study.scene.test.ts` at six candidate angles
 * — see this file's own top comment for the full argument. */
export const TABLE_TILT_DEG = 18;

/** Shared with the die-pip legibility candidates above; a value in the same
 * order of magnitude as `dice-ui/dice-styles.ts`'s own `.hexdev-dice-scene`
 * perspective (480px), so the cup and the dice inside it read as though
 * viewed by the same camera rather than two unrelated depths. */
export const TABLE_TILT_PERSPECTIVE_PX = 500;

/**
 * A seat's own size multiplier from tilting the table back by
 * `TABLE_TILT_DEG`, as a REAL perspective projection — not a per-seat-count
 * lookup table, so it needs no adjustment at 2, 4, or 6 seats.
 *
 * `y` is table-layout.ts's own unit-circle vertical offset: `+1` at the
 * viewer's own seat (bottom, nearest), `-1` at the farthest seat (top),
 * `0` at a side seat (neither nearer nor farther than the viewer).
 *
 * THE ARITHMETIC: tilting a flat plane back by `TABLE_TILT_DEG` around its
 * own horizontal axis moves a point sitting `y * TABLE_DEPTH_RADIUS_PX` off
 * that axis into depth `z = y * TABLE_DEPTH_RADIUS_PX * sin(TABLE_TILT_DEG)`
 * — positive `z` is CLOSER to the camera (the viewer's own seat, `y=1`,
 * always moves closer; the farthest seat, `y=-1`, always moves away). A
 * perspective camera at distance `TABLE_TILT_PERSPECTIVE_PX` then draws
 * whatever sits at depth `z` at `perspective / (perspective - z)` its own
 * flat size — bigger where `z` is positive, smaller where it is negative,
 * unchanged at `z=0` (a side seat, exactly as near or far as the viewer).
 */
export function depthScaleFor(y: number): number {
  const tiltRad = (TABLE_TILT_DEG * Math.PI) / 180;
  const z = y * TABLE_DEPTH_RADIUS_PX * Math.sin(tiltRad);
  return TABLE_TILT_PERSPECTIVE_PX / (TABLE_TILT_PERSPECTIVE_PX - z);
}

/**
 * The one declared, shared tilt transform every seat's cup graphic applies —
 * IDENTICAL for every seat, so the only per-seat variable is `depthScaleFor`
 * above, never a second, independently-tunable angle. Read as a function
 * (never a precomputed constant string) so `table-perspective.test.ts` can
 * assert it is built from `TABLE_TILT_PERSPECTIVE_PX`/`TABLE_TILT_DEG`
 * rather than a copy of them.
 */
export function cupTiltTransform(): string {
  return `perspective(${String(TABLE_TILT_PERSPECTIVE_PX)}px) rotateX(${String(TABLE_TILT_DEG)}deg)`;
}
