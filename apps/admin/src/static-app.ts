import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

/**
 * Serves the built React SPA (`dist-ui/`, `vite.config.ts`'s own build
 * output) out of this app's OWN `node:http` server — the same "one built
 * file, a fixed distDir" shape `packages/widget-frontdoor/src/static-widget-app.ts`
 * already establishes for `widget-app.js`/`loader.js`, applied here to the
 * panel's own index page and its hashed asset files instead.
 *
 * WHY THIS APP SERVES ITS OWN UI, rather than a separate dev-server origin
 * proxying API calls across (`apps/admin/src/ui/api.ts`'s own header
 * comment already states the conclusion this module makes true): the
 * session cookie is `SameSite=Strict` and `csrf.ts` refuses a foreign
 * `Origin`/`Referer` outright, so a cross-origin browser tab talking to two
 * different ports could never carry a working session at all. `GET /login`
 * (`login-form`, PUBLIC) is where a browser first loads the SPA — regardless
 * of whether the operator already has a live session, since the CLIENT-SIDE
 * `AppShell` is what decides, via `GET /`, whether to render the login
 * screen or the tenant list. `GET /assets/*` (`asset`, PUBLIC) serves the
 * built JS/CSS bundle Vite's own `index.html` already references at exactly
 * that path (Vite's default `base: "/"` behavior — no extra config needed).
 */

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

/** Falls back to a generic binary type for anything Vite's build emits that
 * this table does not name — never a build failure over an unlisted
 * extension, since a wrong-but-harmless `Content-Type` is a cosmetic
 * concern, not a correctness one. */
export function contentTypeForAsset(filename: string): string {
  return CONTENT_TYPES[extname(filename)] ?? "application/octet-stream";
}

export interface StaticAppResult {
  readonly status: number;
  readonly contentType: string;
  readonly body: Buffer | string;
}

const NOT_BUILT_MESSAGE = "not built — run `pnpm --filter @hexdev/admin run build:ui`";

/** `GET /login` (`login-form`). */
export async function serveIndexHtml(distDir: string): Promise<StaticAppResult> {
  try {
    const body = await readFile(join(distDir, "index.html"), "utf8");
    return { status: 200, contentType: "text/html; charset=utf-8", body };
  } catch {
    return { status: 404, contentType: "text/plain; charset=utf-8", body: `index.html ${NOT_BUILT_MESSAGE}` };
  }
}

/**
 * `GET /assets/:file` (`asset`). `file` arrives ALREADY sanitized by
 * `routing.ts`'s own `assetFileName` (no `/`, `..`, `\`, or `%2f`) before
 * `resolveAdminRoute` ever resolves this kind — the same "a route that
 * cannot express a traversal is a stronger guarantee than a reader that has
 * to remember to check for one" argument that function's own docstring
 * makes, so this function joins it onto `distDir` with no second check of
 * its own, mirroring `static-widget-app.ts`'s identical trust boundary.
 */
export async function serveBuiltAsset(distDir: string, file: string): Promise<StaticAppResult> {
  try {
    const body = await readFile(join(distDir, "assets", file));
    return { status: 200, contentType: contentTypeForAsset(file), body };
  } catch {
    return { status: 404, contentType: "text/plain; charset=utf-8", body: `${file} ${NOT_BUILT_MESSAGE}` };
  }
}
