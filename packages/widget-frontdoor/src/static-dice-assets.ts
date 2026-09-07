import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DICE_ASSET_FILENAMES } from "@hexdev/dice-ui";
import type { StaticAssetResult } from "./static-widget-app.js";

/**
 * Serves one dice asset — a die face or the cubilete. The widget-app bundle
 * resolves these at RUNTIME as `new URL("../assets/dice/<name>.webp",
 * import.meta.url)` relative to wherever `widget-app.js` itself is served
 * from, which lands on `/assets/dice/<name>.webp`, a route this composition
 * root must therefore actually serve or every die on the tray renders as a
 * broken image. `assetsDir` is `@hexdev/dice-ui`'s own checked-in
 * `assets/dice/` directory — never generated, never copied at build time.
 *
 * ONE DIRECTORY, SEVEN NAMES, NO SPECIAL CASE. Six faces and the cup sit
 * together, so this reader takes one directory and the route takes one
 * prefix. The cup was moved there to make that true; the alternative was an
 * exact-path `/assets/cup.webp` route sitting outside `resolveRoute`'s shared
 * traversal guard, which would have been a second thing to remember.
 *
 * A DERIVED SET, NOT A REGEX, AND THAT IS THE POINT OF THIS FILE.
 * `DICE_ASSET_FILENAMES` is built at module scope from that package's own
 * `DIE_FACES`, so the accepted language is exactly the seven names the
 * artwork has — sound AND complete by construction. Its neighbour
 * `static-deck-assets.ts:13` is the other shape: a hand-typed regex whose
 * comment claims it is `cardId()`'s, in a package that (verified) does not
 * depend on `spanish-deck-ui` at all and therefore cannot check the claim. A
 * regex can be tested for completeness — feed it the valid names — and never
 * for soundness, because enumerating a regular language is not something a
 * test can do.
 *
 * THE COST, RE-STATED HERE RATHER THAN SILENTLY RE-TAKEN. This makes
 * `widget-frontdoor` (L2) depend on a SECOND L0 art package. Every layer rule
 * permits it and `static-tile-assets.ts` already took it once — but a
 * precedent that gets quietly reused stops being a decision, so it is taken
 * again on its own merits and marked OVERTURNABLE for the same reason and
 * with the same fallback: an enumerated regex plus a test asserting every
 * face is accepted, which proves completeness only. What is new the second
 * time is the price of the alternative: two art packages guarded by two
 * hand-typed patterns are two claims nobody can check, in a file whose whole
 * job is deciding which bytes leave the process.
 *
 * AND THE DECK IS STILL NOT RETROFITTED HERE, for the reason its neighbour
 * already gives: merging distinct defects into one fence is how a fence stops
 * naming what it caught.
 *
 * Matched BEFORE touching the filesystem, so an unrelated or
 * traversal-shaped request is refused on membership alone — the same "fail
 * closed on shape, not on a blocklist" discipline `referer-origin.ts` and
 * `session-renew-handler.ts` already apply in this package, and the second of
 * two independent layers behind `resolveRoute`'s own `..`/`%2f` refusal.
 */
export async function serveDiceAsset(assetsDir: string, filename: string): Promise<StaticAssetResult> {
  if (!DICE_ASSET_FILENAMES.has(filename)) {
    return { status: 404, contentType: "text/plain; charset=utf-8", body: "not a real dice asset" };
  }
  try {
    const body = await readFile(join(assetsDir, filename));
    return { status: 200, contentType: "image/webp", body };
  } catch {
    return { status: 404, contentType: "text/plain; charset=utf-8", body: "dice asset not found" };
  }
}
