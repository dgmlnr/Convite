/**
 * THE ARTWORK'S OWN BOX, measured off the source rather than declared for it.
 *
 * All 42 upstream SVGs carry `viewBox="0 0 139.764 200"` — zero variation,
 * checked file by file — so the face has one intrinsic shape and it is this.
 */
export const TILE_ART_WIDTH = 139.764;
export const TILE_ART_HEIGHT = 200;
export const TILE_ART_RATIO = TILE_ART_WIDTH / TILE_ART_HEIGHT;

/**
 * THE BODY IS THE ART'S BOX, AND THAT WAS DECIDED BY LOOKING.
 *
 * The change's own asset survey called this artwork "the face symbol only, no
 * tile body", and the first geometry written from that sentence put the face
 * inside a 3:4 slab with a 12-unit inset. Rendering one tile shows the
 * sentence is not right: every file draws a thick dark ROUNDED-RECTANGLE
 * OUTLINE that reaches the canvas edge — measured, the alpha bounding box is
 * the full canvas on every one of the 42 — and leaves only the INTERIOR
 * transparent. The artist drew the tile; what is missing is its fill, not its
 * silhouette. Inset inside a slab of our own, that outline reads as a second
 * frame around a first one.
 *
 * So the body registers with the art instead of containing it: same box, same
 * ratio, drawn underneath. What this package supplies is the bone the artwork
 * leaves see-through, and the light that makes it read as a solid object.
 *
 * AND THE RATIO IS THE ART'S, NOT 3:4. This change's earlier arithmetic used
 * r = 0.75 for "a real mahjong tile". These tiles are 0.69882 because that is
 * what the drawing is, and forcing them into 3:4 could only stretch them or
 * letterbox them. Anything downstream that fits a board — the waste fraction,
 * the binding width — has to use this number.
 */
export const TILE_WIDTH = TILE_ART_WIDTH;
export const TILE_HEIGHT = TILE_ART_HEIGHT;
export const TILE_VIEWBOX = `0 0 ${String(TILE_WIDTH)} ${String(TILE_HEIGHT)}`;

/** Measured off the artwork's own corner arc: it reaches the left edge 14
 * raster rows down at 162px wide, i.e. ~12 of these units. Kept in step with
 * the drawing so the bone never shows outside the outline. */
export const TILE_RADIUS = 12;

/** The artwork's own outline thickness, measured the same way: 8 opaque
 * pixels of 162 across a scanline through an empty face, i.e. ~7 units. What
 * the bevel has to sit inside of to be visible at all. */
export const TILE_FRAME = 7;

/** The lit/shaded ring, drawn just inside `TILE_FRAME` — in the region the
 * artwork leaves transparent, which is the only place it can show. */
export const TILE_BEVEL = 5;

/**
 * THE CAP, AND WHY THERE HAS TO BE ONE.
 *
 * `spanish-deck-ui/tools/process-svg-deck.mjs:25-29` rasterizes at ~2.7x the
 * largest width the artwork is ever DRAWN at, and derived 329 from a card
 * that never exceeds 122px. Applying the same rule to a board needs the same
 * input — the LARGEST on-screen width — and a board has none: it fills its
 * container, and a container has no upper bound. The 29.5px this change's
 * render measurement produced is the opposite end, the SMALLEST-container
 * width a phone binds; 2.7x of that is the 80px the measurement floated, and
 * it would rasterize for the smallest tile anybody ever sees.
 *
 * So the largest width is DECLARED. The board draws
 * `min(container-derived, cap)`, and 72 is the cap: the widest container the
 * measurement actually reached (1400x900) draws about 71px per tile, so this
 * shrinks nothing anyone measured and anything larger buys pixels no measured
 * container asks for.
 *
 * Move this and `front-image.test.ts` fails, because the shipped raster is
 * derived from it. That is the point — the deck's stale-rationale story
 * (`spanish-deck-ui/src/front-image.ts:128-141`) is a dimension nobody
 * re-derived when the artwork under it changed shape.
 */
export const TILE_MAX_INLINE_SIZE = 72;

/** The deck's own factor, kept so both artworks answer to one rule rather
 * than to two numbers that happen to look similar. */
export const TILE_RASTER_OVERSAMPLE = 2.7;
