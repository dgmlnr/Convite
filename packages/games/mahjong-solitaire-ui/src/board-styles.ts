import { TILE_ART_RATIO, TILE_MAX_INLINE_SIZE, TILE_THEME_DEFAULTS } from "@hexdev/mahjong-tile-ui";
import { BOARD_BLOCK_IN_TILE_HEIGHTS, BOARD_INLINE_IN_TILE_WIDTHS, BOARD_LAYERS, BOARD_PADDING, LAYER_STEP_X } from "./board-geometry.js";

export const BOARD_STYLE_ID = "hexdev-mahjong-board-styles";

/**
 * The felt, the turtle's box, and where each tile sits on it — as a string,
 * because this package builds with plain `tsc -b` and has no bundler to
 * resolve a stylesheet import. Same arrangement `truco-ui` and `escoba-ui`
 * already use; injected once by `ensureBoardStyles`.
 *
 * EVERY NUMBER IS INTERPOLATED FROM `board-geometry.ts`, never retyped. The
 * board's extent, the layer step and the cap all exist in exactly one place,
 * and this sheet reads them — so a mutation of the model moves the pixels,
 * which is what lets `board-fit.browser.test.ts` measure a real element
 * against `bindingTileWidth`'s prediction and have that mean something.
 *
 * CONTAINER QUERIES AND `dvh`, AND NOTHING ELSE. The widget never measures
 * its own box: no `ResizeObserver`, no `matchMedia`, no `innerWidth`. The
 * inline budget is `100cqw`, the container's own content box; the block
 * budget is the window, and it is consulted ONLY in fullscreen, for the same
 * reason truco's own fit cap is scoped that way. Inline, the host sizes the
 * iframe to the height the widget reports, so `100dvh` there would be a
 * function of this board's own content — a feedback loop, not a ceiling.
 * `no-measurement.test.ts` is the fence.
 *
 * NO `z-index`, ANYWHERE. Five layers of tiles overlap and the topmost one
 * has to win a press; DOM order is what decides that, and the renderer draws
 * in ascending `(z, y, x)` — the layout's own order. Measured: with
 * `zIndex: auto` throughout, `elementFromPoint` returns the apex through five
 * layers of occlusion. The repo's existing renderers carry the same idiom, so
 * this is not a new bet.
 */
export function buildBoardStylesheet(): string {
  const inlineInTiles = String(BOARD_INLINE_IN_TILE_WIDTHS);
  const blockInTiles = String(BOARD_BLOCK_IN_TILE_HEIGHTS);
  const topLayer = String(BOARD_LAYERS - 1);
  return `
.hexdev-mahjong-board {
  /* The board's own container-query root. INLINE-SIZE and not SIZE: the
     height of an embedded widget comes from what it holds, and \`size\`
     containment would make this box's own height stop depending on its
     contents — which is the one thing that has to keep working when the host
     grants no height at all. The block budget comes from the window instead,
     in the one mode where the window is the box. */
  container-type: inline-size;
  container-name: hexdev-mahjong-board;
  --mj-board-padding: ${String(BOARD_PADDING)}px;
  --mj-tile-max-inline-size: ${String(TILE_MAX_INLINE_SIZE)}px;
  ${Object.entries(TILE_THEME_DEFAULTS)
    .map(([token, value]) => `${token}: ${value};`)
    .join("\n  ")}
  box-sizing: border-box;
  width: 100%;
  padding: var(--mj-board-padding);
  display: grid;
  place-items: center;
  /* NOTHING HERE IS TEXT. Dragging across the turtle painted its tiles in the
     browser's selection colour — an \`<img>\` inside a \`<div>\` is selectable
     content by default, and this board has no prose for the gesture to be
     FOR. Declared once here and inherited rather than repeated on the tile:
     the felt is the whole surface the cursor can travel over, and a rule
     scoped to tiles alone would still let a drag that started on the felt
     sweep them up. \`-webkit-\` first, for Safari and older WebKit. */
  -webkit-user-select: none;
  user-select: none;
  /* Felt, and the tenant's own primary when it has one — the same token and
     the same fallback truco's and escoba's tables read. A tile is bone
     coloured (\`TILE_THEME_DEFAULTS\`); the surface under it has to be dark
     enough that 144 of them read as objects on a table rather than as a
     texture. */
  background: var(--gx-color-primary, #1e5c43);
  font-family: var(--gx-font-family, system-ui, sans-serif);
}

.hexdev-mahjong-board-surface {
  /* THE BLOCK BUDGET, and the sentinel is deliberate. Inline there is no
     ceiling to respect, so this has to be a value \`min()\` never picks; the
     cap below is what actually decides there. Fullscreen replaces it with the
     window, which is the whole of the override at the bottom of this sheet. */
  --mj-board-block-budget: 100000px;
  /* THE THREE BUDGETS, in the order board-geometry.ts states them: what the
     width can pay for, what the height can pay for, and the declared cap.
     \`bindingTileWidth\` is this same expression in TypeScript, and a browser
     fence measures one against the other. */
  --mj-tile-width: min(
    100cqw / ${inlineInTiles},
    var(--mj-board-block-budget) * ${String(TILE_ART_RATIO)} / ${blockInTiles},
    var(--mj-tile-max-inline-size)
  );
  --mj-tile-height: calc(var(--mj-tile-width) / ${String(TILE_ART_RATIO)});
  /* ONE STEP FOR BOTH AXES, and that is not a simplification. The offset is
     24 of the artwork's own units in each direction — twice its frame plus
     its bevel — so as a FRACTION it is 17.17% of a tile's width and 12% of
     its height, two different numbers of the same distance. In pixels there
     is only one. */
  --mj-layer-step: calc(var(--mj-tile-width) * ${String(LAYER_STEP_X)});
  position: relative;
  width: calc(var(--mj-tile-width) * ${inlineInTiles});
  height: calc(var(--mj-tile-height) * ${blockInTiles});
}

.hexdev-mahjong-tile {
  /* Absolutely placed from its own half-cell coordinates, which the renderer
     pushes in as unitless custom properties and never reads back. The board
     is a fixed 144-position layout, not a flow: every tile knows exactly
     where it goes, and a grid or a flex line would have to be told the same
     thing twice. */
  position: absolute;
  width: var(--mj-tile-width);
  height: var(--mj-tile-height);
  left: calc(var(--mj-x) * var(--mj-tile-width) / 2 + var(--mj-z) * var(--mj-layer-step));
  /* The base layer sits LOWEST on screen, so the whole stack is pushed down
     by the four steps the apex will climb back up. Without it the top layer
     would hang off the surface's own box. */
  top: calc(var(--mj-y) * var(--mj-tile-height) / 2 + (${topLayer} - var(--mj-z)) * var(--mj-layer-step));
}

.hexdev-mahjong-tile > * {
  /* THE HIT TARGET IS THE TILE, NEVER ITS PARTS. A press has to answer with a
     layout position, and only the tile carries one; letting the face or the
     body win would make \`elementFromPoint\` return an element with nothing to
     say. \`hit-test.ts\` still climbs to the nearest tile anyway — that is
     defence in depth against a caller who never injected this sheet, and it
     has its own fence. */
  pointer-events: none;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* FULLSCREEN FIT — the one mode where the board has a ceiling to respect.
   \`apps/widget-app/src/handshake.ts\` stamps this attribute on its own
   document root in the same call that tells the host to expand, so the two
   can never disagree about which mode is in effect, and \`enterMatch\` sends
   it before the first tile is drawn.

   Fullscreen the host pins the widget to the viewport with
   \`position: fixed; inset: 0\` and cannot scroll it: the board fits or it is
   clipped. INLINE the host sizes the iframe to the height the widget reports,
   so reading the window here would make the budget a function of this board's
   own content. The same scope, and the same reason, as truco's and escoba's
   own fit caps. */
:root[data-hexdev-layout="fullscreen"] .hexdev-mahjong-board-surface {
  --mj-board-block-budget: calc(100dvh - var(--mj-board-padding) * 2);
}

/* AND THE FELT IS THE WHOLE OF THAT BOX, not the part of it the turtle
   happens to need.

   The tile width is the SMALLEST of three budgets, so whenever the width is
   the one that binds — a window that is wide relative to its height, which is
   every desktop — the turtle comes out shorter than the room it was given and
   this box, whose height is its content, comes out shorter with it. What sat
   under the remainder was the host page's own background: a pale strip below
   the felt, on the one screen that is supposed to read as a table.

   IT ALSO CENTRES THE TURTLE, and that is the same fix rather than a second
   one. \`place-items: center\` was already here and had nothing to work with;
   a box with room to spare is what turns it back on, so the board sits in the
   middle of its felt instead of hanging from the top of it. Both were
   reported separately and both are this one missing line.

   \`min-height\` AND NOT \`height\`, so the declaration can only ever ADD felt.
   Should a window ever be short enough that the turtle is the taller of the
   two, a fixed height would clip it — and the block budget above already
   exists to keep that from happening, which is a different job this rule must
   not quietly take over. Scoped to fullscreen for the reason the budget above
   is: inline, the host sizes the iframe to the height the widget reports, and
   a widget that reported the window would be granted the whole of it. */
:root[data-hexdev-layout="fullscreen"] .hexdev-mahjong-board {
  min-height: 100dvh;
}

/* THE TILE THE PLAYER HAS PRESSED ONCE. Half of a move is on the board and
   the other half is in the player's head, so this is the only thing telling
   them the first press landed at all.

   A DROP-SHADOW HALO AND NOT AN OUTLINE, because the tile is a rounded slab
   drawn inside an SVG while its element is a plain rectangle: an \`outline\`
   would trace the rectangle and read as a rendering fault at every corner.
   \`filter\` composites the element's own painted alpha, so the halo follows
   the artwork's real silhouette. Two stacked shadows rather than one wide
   one — a tight ring for the edge and a soft one for the glow — because a
   single large blur washes out against bone at 30px.

   NOT A COLOUR CHANGE, and not a transform. Recolouring would fight artwork
   this package does not own (\`mahjong-tile-ui\`'s faces are fixed across every
   tenant, deliberately), and moving the tile would move a hit target the
   press test measures to the pixel. The accent is the tenant's own, with the
   product's gold underneath it, exactly as the lobby's prominent control
   does. */
.hexdev-mahjong-tile[data-selected="true"] {
  /* THE BONE TAKES THE ACCENT, and the halo alone did not do the job. Looked
     at on the real turtle at the binding width, a gold glow around a bone
     tile surrounded by other bone tiles is nearly invisible: every neighbour
     is the same colour and the halo has three or four competing edges to be
     lost against. The tile itself has to change.

     THROUGH THE TILE'S OWN THEME TOKENS, which is what makes this legal
     rather than a hack. \`tile-body.ts\` draws the slab, its edge and its
     bevel from four custom properties precisely so they are theme surfaces;
     the FACE is the one thing that stays fixed across every tenant, and it is
     a raster this rule never touches. Overriding them here cascades into the
     nested SVG and nowhere else. */
  --mj-tile-face: color-mix(in srgb, var(--gx-color-accent, #d4af37) 38%, #f4efe2);
  --mj-tile-edge: color-mix(in srgb, var(--gx-color-accent, #d4af37) 70%, #cbbfa4);
  --mj-tile-bevel-light: color-mix(in srgb, var(--gx-color-accent, #d4af37) 25%, #fffdf6);
  filter: drop-shadow(0 0 2px var(--gx-color-accent, #d4af37)) drop-shadow(0 0 6px var(--gx-color-accent, #d4af37));
}

.hexdev-mahjong-tile-face {
  display: block;
  /* The artwork is 195x279 and the box is 0.69882 of its own height — the
     same proportion — so \`contain\` never actually letterboxes anything. It
     is here so that a face which somehow is not that shape shows as a smaller
     symbol on a correct tile, rather than a stretched one. */
  object-fit: contain;
}
`;
}

/** Injects the stylesheet at most once per document — the same idempotence
 * every other `ensure*Styles` in this repo has. */
export function ensureBoardStyles(doc: Document): void {
  if (doc.getElementById(BOARD_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = BOARD_STYLE_ID;
  style.textContent = buildBoardStylesheet();
  doc.head.appendChild(style);
}
