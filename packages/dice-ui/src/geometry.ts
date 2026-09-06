/**
 * Every number a die or a cup draws from, and the one table that turns a
 * DECIDED face into a POSE rather than into a repaint.
 *
 * NOTHING HERE READS A LIVE DOM BOX, the same discipline
 * `mahjong-solitaire-ui/board-geometry.ts` states for itself and
 * `no-measurement.test.ts` fences there: every dimension is arithmetic on a
 * fixed constant, never `getBoundingClientRect()`. A die's own render function
 * (`die.ts`) only ever WRITES a transform; it never measures one.
 */

/** The six faces a physical die has. Not `number`, so a caller cannot pass
 * `0` or `7` and have it silently become an out-of-range table lookup. */
export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;
export const DIE_FACES: readonly DieFace[] = [1, 2, 3, 4, 5, 6];

/**
 * THE DIE'S OWN BOX. A single square viewBox for every face — front, back,
 * and the four sides drawn as it rotates in space — because a real die's
 * faces are literally the same square, six times.
 */
export const DIE_SIZE = 100;
export const DIE_VIEWBOX = `0 0 ${String(DIE_SIZE)} ${String(DIE_SIZE)}`;

/** Corner rounding of the flat body, same idiom as `TILE_RADIUS`. */
export const DIE_RADIUS = 14;
/** How far in from the edge the flat face sits before the bevel ring starts.
 * Unlike `TILE_FRAME`, this answers to no raster artwork underneath — a die
 * has none, the SVG is the whole face — so it is a plain aesthetic choice of
 * how wide the flat margin around the pips reads, kept small so the bevel is
 * close enough to the edge to actually be seen at a 30-40px on-screen size. */
export const DIE_FRAME = 4;
/** The lit/shaded ring's stroke width, same recipe as `TILE_BEVEL`: two arcs,
 * one lit one shaded, and no `<defs>` because flat fills need none. */
export const DIE_BEVEL = 5;

/**
 * THE NINE CANONICAL PIP SLOTS a standard die face is drawn from, indexed
 * top-to-bottom, left-to-right (0 = top-left … 8 = bottom-right, 4 = centre).
 * Every face is a SUBSET of this one grid — no face invents its own layout —
 * which is what makes `die-pips.test.ts` able to assert a face's pip COUNT
 * and a face's exact positions from one shared table instead of six
 * independently hand-placed drawings that could quietly drift apart.
 */
const PIP_MARGIN = 26;
const PIP_MID = DIE_SIZE / 2;
const PIP_FAR = DIE_SIZE - PIP_MARGIN;
export const PIP_SLOTS: readonly (readonly [number, number])[] = [
  [PIP_MARGIN, PIP_MARGIN],
  [PIP_MID, PIP_MARGIN],
  [PIP_FAR, PIP_MARGIN],
  [PIP_MARGIN, PIP_MID],
  [PIP_MID, PIP_MID],
  [PIP_FAR, PIP_MID],
  [PIP_MARGIN, PIP_FAR],
  [PIP_MID, PIP_FAR],
  [PIP_FAR, PIP_FAR],
];
export const PIP_RADIUS = 7;

/**
 * Which of the nine slots each face lights up — the standard convention
 * (opposite faces sum to seven: 1↔6, 2↔5, 3↔4) drawn the ordinary way every
 * die in the world is drawn, not a house invention. Indices into `PIP_SLOTS`.
 */
export const FACE_PIP_SLOTS: Readonly<Record<DieFace, readonly number[]>> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/**
 * THE SIX SIDES OF THE CUBE THIS PACKAGE ACTUALLY BUILDS.
 *
 * A rolled die is not one flat face swapped for another — it is a solid cube
 * that ends up sitting one particular way. So `die.ts` builds all six sides
 * as a real `transform-style: preserve-3d` cube, each side carrying its OWN
 * fixed local transform (never touched again after the cube is assembled) and
 * its own permanently-assigned face number, exactly the way a physical die's
 * six faces never change which numbers are opposite which.
 *
 * `translateZ` pushes each side out to the cube's own half-width, and the
 * preceding rotation turns that push into the correct direction — `front`
 * needs none, `back` needs a full turn, the four others a quarter turn each.
 */
export type DieSide = "front" | "back" | "right" | "left" | "top" | "bottom";
export const DIE_SIDE_ORDER: readonly DieSide[] = ["front", "back", "right", "left", "top", "bottom"];

/** Standard opposite-faces-sum-to-seven pairing, pinned to the cube's six
 * named sides rather than left as a bare number so `die.ts` can label each
 * facelet by BOTH its geometry and its face while assembling it. */
export const DIE_SIDE_FACE: Readonly<Record<DieSide, DieFace>> = {
  front: 1,
  back: 6,
  right: 2,
  left: 5,
  top: 3,
  bottom: 4,
};

const HALF = DIE_SIZE / 2;
/** Fixed, never-recomputed per-side placement. `die.ts` writes this ONCE per
 * facelet at assembly time; nothing here changes when a die is rolled — only
 * the CUBE's own outer rotation does (`FACE_ROTATION` below). */
export const DIE_SIDE_LOCAL_TRANSFORM: Readonly<Record<DieSide, string>> = {
  front: `translateZ(${String(HALF)}px)`,
  back: `rotateY(180deg) translateZ(${String(HALF)}px)`,
  right: `rotateY(90deg) translateZ(${String(HALF)}px)`,
  left: `rotateY(-90deg) translateZ(${String(HALF)}px)`,
  top: `rotateX(-90deg) translateZ(${String(HALF)}px)`,
  bottom: `rotateX(90deg) translateZ(${String(HALF)}px)`,
};

/**
 * THE ONLY TABLE A ROLL EVER CONSULTS, and the whole determinism contract in
 * six rows.
 *
 * A facelet's OUTWARD normal, after the cube's own rotation `R` is applied on
 * top of that facelet's fixed local rotation `Rf`, points wherever `R ∘ Rf`
 * sends it. Bringing face N to point at the viewer (the same direction
 * `front`'s own normal already has with no rotation at all) means solving
 * `R ∘ Rf = identity`, i.e. `R = Rf⁻¹` — the inverse of exactly the rotation
 * `DIE_SIDE_LOCAL_TRANSFORM` already committed to for the side that carries
 * N. `die-rotation-consistency.test.ts` proves this arithmetically: it
 * extracts the rotation component back out of each side's own fixed local
 * transform, negates it, and asserts the result IS this table's entry for
 * that side's face — so this is not six independently-typed numbers that
 * could quietly drift from the cube they are meant to pose, it is a value
 * derived from the same six lines above.
 *
 * THIS IS THE ENTIRE MECHANISM THAT MAKES A LANDING LOOK PHYSICAL RATHER
 * THAN DECIDED AFTER THE FACT: `die.ts` writes this pose as the resting
 * `transform` the instant a face is known, before any animation class is
 * ever added. The toss keyframe's own `from` state is written as an OFFSET
 * added to these same two numbers (`dice-styles.ts`), never as an
 * independent value — so every frame of the fall is a rotation of the one
 * true face, and the anti-pattern this whole package exists to avoid (spin a
 * generic sequence, swap the real face in at the very end) is not a
 * discipline anyone has to remember, it is a value nothing else can reach.
 */
export const FACE_ROTATION: Readonly<Record<DieFace, { readonly rotateX: number; readonly rotateY: number }>> = {
  1: { rotateX: 0, rotateY: 0 },
  2: { rotateX: 0, rotateY: -90 },
  3: { rotateX: 90, rotateY: 0 },
  4: { rotateX: -90, rotateY: 0 },
  5: { rotateX: 0, rotateY: 90 },
  6: { rotateX: 0, rotateY: 180 },
};

/**
 * The CSS custom-property declaration that encodes a face's resting pose,
 * as a plain string — no element, no rendering, so
 * `resting-pose.test.ts` can assert the exact contract with a regex and
 * nothing else. `die.ts` writes this string into an element's `style`
 * attribute BEFORE the toss animation class is ever applied; `dice-styles.ts`
 * reads the same two custom properties back out with `var(...)`, in both the
 * resting rule and the toss keyframe's `from` state, which is what makes the
 * two impossible to disagree — they are not two numbers kept in step by
 * convention, they are one write read twice.
 */
export function restingPoseDeclaration(face: DieFace): string {
  const { rotateX, rotateY } = FACE_ROTATION[face];
  return `--dice-rest-x: ${String(rotateX)}deg; --dice-rest-y: ${String(rotateY)}deg;`;
}

/**
 * THE CUP'S OWN BOX: narrower at the rim than at the base, in profile —
 * a plain rectangle reads as a box holding dice, not as the cup ("cubilete")
 * itself that a player presses to throw them.
 */
export const CUP_WIDTH = 100;
export const CUP_HEIGHT = 118;
export const CUP_VIEWBOX = `0 0 ${String(CUP_WIDTH)} ${String(CUP_HEIGHT)}`;
/** How much narrower the rim is than the base, per side. */
export const CUP_RIM_INSET = 16;
export const CUP_FRAME = 6;
export const CUP_BEVEL = 6;

/**
 * WCAG 2.5.5 / the 2026 dice-app survey this change's own exploration cites:
 * 44×44 CSS px is the accepted floor for a tappable target. The cup's SVG
 * viewBox above is unitless and gets scaled by CSS — this is the real,
 * on-screen minimum `dice-styles.ts` enforces on the BUTTON, independent of
 * however large or small the artwork inside it is drawn.
 */
export const CUP_TAP_MIN = 44;
