import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StaticAssetResult } from "./static-widget-app.js";

/** Exactly `@hexdev/spanish-deck-ui`'s own `cardId()` shape
 * (`${rank}-${suit}.webp`) — the ONLY filenames that can ever exist under
 * `assets/fronts/`. Matched BEFORE touching the filesystem at all, so an
 * unrelated or path-traversal-shaped request (`../secret.txt`, `1-espada`
 * with no extension, any other extension) is rejected on shape alone, the
 * same "fail closed on shape, not on a blocklist" discipline
 * `referer-origin.ts`/`session-renew-handler.ts` already apply elsewhere in
 * this composition root. */
const CARD_FRONT_FILENAME = /^(?:1|2|3|4|5|6|7|10|11|12)-(?:espada|basto|oro|copa)\.webp$/;

/**
 * Serves one real card front — the widget-app bundle resolves
 * these at RUNTIME as `new URL("../assets/fronts/", import.meta.url)`
 * relative to wherever `widget-app.js` itself is served from
 * (`serveWidgetAppAsset`'s own `/assets/widget-app.js` route), which lands
 * on `/assets/fronts/<cardId>.webp` — a route this composition root must
 * therefore actually serve, or every card in the table renders as a broken
 * image. `assetsDir` is `@hexdev/spanish-deck-ui`'s own checked-in
 * `assets/fronts/` directory (never generated, never copied at build time —
 * see that package's own `front-image.ts` docstring).
 */
export async function serveCardFrontAsset(assetsDir: string, filename: string): Promise<StaticAssetResult> {
  if (!CARD_FRONT_FILENAME.test(filename)) {
    return { status: 404, contentType: "text/plain; charset=utf-8", body: "not a real card front" };
  }
  try {
    const body = await readFile(join(assetsDir, filename));
    return { status: 200, contentType: "image/webp", body };
  } catch {
    return { status: 404, contentType: "text/plain; charset=utf-8", body: "card front not found" };
  }
}
