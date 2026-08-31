import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TILE_FRONT_FILENAMES } from "@hexdev/mahjong-tile-ui";
import type { StaticAssetResult } from "./static-widget-app.js";

/**
 * Serves one real mahjong tile face — the widget-app bundle resolves these at
 * RUNTIME as `new URL("../assets/tiles/<tileId>.webp", import.meta.url)`
 * relative to wherever `widget-app.js` itself is served from, which lands on
 * `/assets/tiles/<tileId>.webp`, a route this composition root must therefore
 * actually serve or every tile on the board renders as a broken image.
 * `assetsDir` is `@hexdev/mahjong-tile-ui`'s own checked-in `assets/tiles/`
 * directory — never generated, never copied at build time.
 *
 * A DERIVED SET, NOT A REGEX, AND THAT IS THE POINT OF THIS FILE.
 * `TILE_FRONT_FILENAMES` is built at module scope from that package's own
 * `tileId()`, so the accepted language is exactly the 42 names the artwork
 * has — sound AND complete by construction. Its neighbour
 * `static-deck-assets.ts:13` is the other shape: a hand-typed regex whose
 * comment claims it is `cardId()`'s, in a package that (verified) does not
 * depend on `spanish-deck-ui` at all and therefore cannot check the claim. A
 * regex can be tested for completeness — feed it the valid names — and never
 * for soundness, because enumerating a regular language is not something a
 * test can do.
 *
 * THE COST, STATED RATHER THAN HIDDEN: this makes `widget-frontdoor` (L2)
 * depend on an L0 art package, which every layer rule permits and which the
 * deck side deliberately never did. It is a new precedent and it is marked
 * OVERTURNABLE — the fallback is an enumerated regex plus a test asserting
 * every `tileId()` is accepted, which proves completeness only.
 *
 * AND THE DECK IS NOT RETROFITTED HERE. Merging two distinct defects into one
 * fence is how a fence stops naming what it caught; that stays its own
 * follow-up.
 *
 * Matched BEFORE touching the filesystem, so an unrelated or
 * traversal-shaped request is refused on membership alone — the same "fail
 * closed on shape, not on a blocklist" discipline `referer-origin.ts` and
 * `session-renew-handler.ts` already apply in this package, and the second of
 * two independent layers behind `resolveRoute`'s own `..`/`%2f` refusal.
 */
export async function serveTileFrontAsset(assetsDir: string, filename: string): Promise<StaticAssetResult> {
  if (!TILE_FRONT_FILENAMES.has(filename)) {
    return { status: 404, contentType: "text/plain; charset=utf-8", body: "not a real tile face" };
  }
  try {
    const body = await readFile(join(assetsDir, filename));
    return { status: 200, contentType: "image/webp", body };
  } catch {
    return { status: 404, contentType: "text/plain; charset=utf-8", body: "tile face not found" };
  }
}
