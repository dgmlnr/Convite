import { TILE_ART_RATIO, TILE_THEME_DEFAULTS, getTileArt, tileBodySvg } from "@hexdev/mahjong-tile-ui";
import type { Tile } from "@hexdev/mahjong-tile-ui";

/**
 * A FRONT-DOOR TILE, drawn by exactly the two functions `board.ts`'s own
 * `drawTile` draws one with: `tileBodySvg()` for the bone, `getTileArt()` for
 * the face on top of it. Nothing here is a second drawing of a tile — it is
 * the same markup, minus the two things that are true only of a tile ON THE
 * BOARD and meaningless anywhere else: a layout position and the absolute
 * `--mj-x`/`--mj-y`/`--mj-z` coordinates `board-styles.ts` turns into
 * `left`/`top`. A lobby card has neither; it has a fan slot, the same one
 * `chrome-styles.ts` already lays truco's and escoba's card faces into.
 *
 * WHY THIS EXISTS AT ALL (see `about.ts`'s license record and `geometry.ts`'s
 * own docblock): the 42 shipped faces are TRANSPARENT — the symbol alone,
 * with no tile body behind it — so a lobby that pointed a plain `<img>` at
 * one would draw a glyph floating on the felt with nothing under it. Truco's
 * and escoba's own card art (`hero-cards.ts`, `game-ui-registry.ts`'s
 * `ESCOBA_FACES`) is deliberately just URLs, on the stated grounds that "the
 * shell decides how to lay them out, and it must be able to without importing
 * a card renderer" — correct for a raster that IS the whole card. It is the
 * wrong shape for a face that is only ever half a picture, and this module is
 * the other half, reused rather than re-invented.
 */
export interface MahjongCardArtTile {
  /**
   * Builds a fresh element in the given document. A FUNCTION, not a shared
   * node: `game-list.ts` calls this once per card it draws, and a node
   * already mounted once cannot be mounted into two cards without being torn
   * out of the first — the same reason `tileBodySvg()` itself returns a
   * string template rather than a cached `SVGElement`.
   */
  readonly render: (doc: Document) => HTMLElement;
}

/**
 * THE THREE TILES, chosen the way `truco-ui`'s `CARD_FACES` and escoba's own
 * badge-card three were: bold, instantly legible artwork rather than an
 * arbitrary slice of the set. The three dragons are the closest thing this
 * game has to truco's matas — a suitless, ranked-nowhere trio with the
 * widest colour spread of any three tiles in the set (red, green, and a WHITE
 * dragon drawn as a blank bordered frame, itself one of the more distinctive
 * and asked-about pieces in a mahjong set) — and they read as "tiles" at a
 * glance the same way HERO_CARDS's matas read as "cards".
 */
const CARD_ART_TILES: readonly Tile[] = [
  { kind: "dragon", dragon: "red" },
  { kind: "dragon", dragon: "green" },
  { kind: "dragon", dragon: "white" },
];

function renderCardArtTile(doc: Document, tile: Tile): HTMLElement {
  const element = doc.createElement("div");
  element.className = "hexdev-mahjong-card-tile";
  // THE TILE'S OWN THEME TOKENS, inline rather than in a shared stylesheet.
  // `tileBodySvg()`'s markup reads `--mj-tile-face`/`-edge`/`-bevel-*` from
  // its ancestor (`board-styles.ts` sets them on `.hexdev-mahjong-board`,
  // scoped to the felt); a lobby card is not on a board and has no ancestor
  // to inherit them from, so this element supplies its own defaults directly
  // — the same defaults, from the same constant, so a tile drawn here and a
  // tile drawn on the felt agree on what "undecorated bone" looks like.
  for (const [token, value] of Object.entries(TILE_THEME_DEFAULTS)) element.style.setProperty(token, value);
  // The artwork's own box ratio (0.69882, geometry.ts), so `height: auto` on
  // the shared `.hexdev-game-card-face` fan rule resolves against the real
  // shape of a tile instead of the deck card ratio that rule was written
  // against — a tile fanned at a card's aspect would be letterboxed inside
  // its own slot on one axis.
  element.style.aspectRatio = String(TILE_ART_RATIO);
  element.style.position = "relative";

  // The bone, mounted the same way `drawTile()` mounts it on the board:
  // generated markup via `innerHTML`, this repository's own idiom for a
  // function that returns an SVG string rather than a DOM node.
  const body = doc.createElement("div");
  body.className = "hexdev-mahjong-card-tile-body";
  body.style.position = "absolute";
  body.style.inset = "0";
  body.innerHTML = tileBodySvg();
  element.appendChild(body);

  const art = getTileArt(tile);
  const face = doc.createElement("img");
  face.className = "hexdev-mahjong-card-tile-face";
  face.style.position = "absolute";
  face.style.inset = "0";
  face.style.width = "100%";
  face.style.height = "100%";
  face.style.objectFit = "contain";
  face.src = art.src;
  face.width = art.width;
  face.height = art.height;
  // Decorative here, exactly as truco's and escoba's own card faces are:
  // `game-list.ts` already hides the whole fan from the accessibility tree
  // (the heading below it names the game), so a real alt text on one face
  // among three would name nothing a player must act on.
  face.alt = "";
  face.decoding = "async";
  // A GAME PIECE, NOT A PICTURE ON A PAGE — the same refusal `drawTile()`
  // states for the board, and for the same reason: an `<img>` is natively
  // draggable, and a lobby is exactly the surface a stray drag gesture starts
  // on.
  face.draggable = false;
  element.appendChild(face);

  return element;
}

/**
 * READY TO ASSIGN TO `GameFamilyUi.cardArt` — an array of markup factories,
 * the widened half of that field's contract. `game-list.ts` tells a factory
 * from a URL with a plain `typeof` check and calls `.render(document)` on
 * whichever of these it draws; nothing about the fan's geometry (size,
 * overlap, rotation) lives here, because that is `chrome-styles.ts`'s own
 * `.hexdev-game-card-face` rule and every card's faces — image or markup —
 * share it.
 */
export const MAHJONG_CARD_ART: readonly MahjongCardArtTile[] = CARD_ART_TILES.map((tile) => ({
  render: (doc: Document) => renderCardArtTile(doc, tile),
}));
