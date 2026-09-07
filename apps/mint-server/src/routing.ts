/**
 * What this role answers for, as a pure decision.
 *
 * The mint role owns the widget's FRONT DOOR — everything a browser touches
 * before a game room exists: the embed page and the token it inlines, the
 * session renewal that token needs later, and the static assets the loader
 * and the widget bundle fetch. It deliberately does NOT answer for colyseus's
 * matchmaking surface; that belongs to the match role, and a deployment's
 * path routing is what separates them behind one public origin.
 *
 * Kept pure and separate from the server so `routing.test.ts` can pin every
 * path without binding a port. The failure this guards against is quiet: a
 * path this role should serve, falling through to 404, looks from the browser
 * exactly like the widget failing to mount with no error in the console at
 * all — the same shape as the baked-origin trap that once cost a full day.
 */
export type Route =
  | { readonly kind: "embed" }
  | { readonly kind: "session-renew" }
  | { readonly kind: "loader" }
  | { readonly kind: "widget-app" }
  | { readonly kind: "card-front"; readonly file: string }
  | { readonly kind: "tile-front"; readonly file: string }
  | { readonly kind: "dice-asset"; readonly file: string }
  | { readonly kind: "not-found" };

/**
 * Whether `/embed` should answer with the widget shell rather than the JSON
 * API. It is content negotiation on ONE path, and it exists because a real
 * browser navigating the iframe's `src` needs the mint result INLINED — a
 * same-origin fetch from inside that iframe back here would carry no origin
 * evidence at all, so there would be nothing to authorise against.
 *
 * Matched on the media type rather than by substring: a caller asking for
 * `application/vnd.my-html-tool+json` wants JSON, and answering it with a
 * page would not error, it would just silently fail to parse. Pure and
 * exported so that branch is pinned by a test instead of living unexamined
 * inside the request handler.
 */
export function prefersHtml(acceptHeader: string | undefined): boolean {
  if (acceptHeader === undefined) return false;
  return acceptHeader.split(",").some((entry) => entry.split(";")[0]?.trim() === "text/html");
}

const CARD_FRONT_PREFIX = "/assets/fronts/";

/**
 * A SECOND LITERAL PREFIX, not a generalisation of the first — and now one of
 * THREE, which changes half the argument and leaves the other half standing.
 *
 * WHAT EXPIRED. This used to read "two artworks exist and no third does",
 * citing `.dependency-cruiser.cjs:38`'s objection to inventing a convention
 * ahead of its second consumer. A third artwork now exists — the dice below —
 * so that clause is simply no longer true, and it is corrected rather than
 * quietly reinterpreted.
 *
 * WHAT DID NOT EXPIRE, and is the reason all three stay literal. A
 * parameterised `/assets/<kind>/` route would have to turn an ARBITRARY
 * segment into a directory, which means answering for kinds nobody ships and
 * making that mapping here, in a pure routing decision that has no business
 * knowing which directories a composition root happens to have on disk. Three
 * consumers make the convention real; they do not make the parameterisation
 * safe. Nor is the duplication the kind that drifts: every prefix delegates
 * its refusals to the ONE `assetFileName` below, so what a copied-and-edited
 * branch could get wrong is written once and read three times.
 */
const TILE_FRONT_PREFIX = "/assets/tiles/";

/**
 * THE THIRD ARTWORK, and the only one whose kind is not called a "front".
 *
 * `card-front` and `tile-front` name a face because a card and a tile have a
 * back that is a different drawing. A die has six faces and no back, and this
 * directory also holds the cubilete, which is not a face at all — so
 * `dice-asset` is the honest kind name and the asymmetry is deliberate rather
 * than an oversight in copying.
 *
 * ONE PREFIX ANSWERS FOR EVERYTHING `dice-ui` SHIPS, cup included, because
 * the cup was moved under `assets/dice/` rather than served by an exact-path
 * case of its own. That alternative was rejected on this file's own terms: an
 * exact `/assets/cup.webp` route would sit OUTSIDE `assetFileName` entirely,
 * so the one shared traversal guard would have covered two of three routes.
 */
const DICE_ASSET_PREFIX = "/assets/dice/";

const NOT_FOUND: Route = { kind: "not-found" };

/**
 * The file name a static-asset prefix carries, or `undefined` when the rest
 * of the path is not a bare name.
 *
 * Rejected HERE, not left to the asset reader: a route that cannot express a
 * traversal is a stronger guarantee than a reader that has to remember to
 * check for one. `%2F` is checked alongside `/` because a caller may hand
 * this function a raw, undecoded pathname. Shared by all three prefixes so
 * the three artworks cannot drift into different refusals — which is the
 * failure a copied-and-edited branch would produce, silently, on whichever
 * one nobody re-read.
 *
 * IT REFUSES SHAPES AND HOLDS NO VOCABULARY. It does not know the deck has
 * forty cards, the wall forty-two drawings or the die six faces, so a
 * well-shaped name that is simply not part of an artwork passes here and is
 * refused one layer down, by the asset reader's membership check before it
 * touches the filesystem. Two independent layers, each answering the question
 * it can actually answer.
 */
function assetFileName(pathname: string, prefix: string): string | undefined {
  const file = pathname.slice(prefix.length);
  if (file === "" || file.includes("/") || file.includes("\\") || file.includes("..") || /%2f/i.test(file)) {
    return undefined;
  }
  return file;
}

export function resolveRoute(method: string, pathname: string): Route {
  if (method === "GET") {
    if (pathname === "/embed") return { kind: "embed" };
    if (pathname === "/loader.js") return { kind: "loader" };
    if (pathname === "/assets/widget-app.js") return { kind: "widget-app" };
    if (pathname.startsWith(CARD_FRONT_PREFIX)) {
      const file = assetFileName(pathname, CARD_FRONT_PREFIX);
      return file === undefined ? NOT_FOUND : { kind: "card-front", file };
    }
    if (pathname.startsWith(TILE_FRONT_PREFIX)) {
      const file = assetFileName(pathname, TILE_FRONT_PREFIX);
      return file === undefined ? NOT_FOUND : { kind: "tile-front", file };
    }
    if (pathname.startsWith(DICE_ASSET_PREFIX)) {
      const file = assetFileName(pathname, DICE_ASSET_PREFIX);
      return file === undefined ? NOT_FOUND : { kind: "dice-asset", file };
    }
    return NOT_FOUND;
  }

  // POST and only POST: the renewal reads Origin/Referer evidence a browser
  // reliably sends on a POST and does not on a same-origin GET — the same
  // discovery `/embed`'s own Referer fallback rests on.
  if (method === "POST" && pathname === "/session/renew") return { kind: "session-renew" };

  return NOT_FOUND;
}
