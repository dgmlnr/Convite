import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface StaticAssetResult {
  readonly status: number;
  readonly contentType: string;
  readonly body: Buffer | string;
}

/**
 * Serves exactly one built file out of `distDir`. Deliberately NOT a
 * general static file server: both callers below pass a FIXED filename they
 * own, never one taken from a request — no path segment is ever joined onto
 * a filesystem path from untrusted input, so there is no path-traversal
 * input to sanitize at all, unlike a general asset server would need to.
 */
async function serveBuiltFile(distDir: string, filename: string, buildHint: string): Promise<StaticAssetResult> {
  try {
    const body = await readFile(join(distDir, filename));
    return { status: 200, contentType: "text/javascript; charset=utf-8", body };
  } catch {
    return { status: 404, contentType: "text/plain; charset=utf-8", body: `${filename} not built — run \`${buildHint}\`` };
  }
}

/** The widget-app's own built browser bundle (a Vite app-mode build — see
 * `apps/widget-app/vite.config.ts`), served at `/assets/widget-app.js`. */
export function serveWidgetAppAsset(distDir: string): Promise<StaticAssetResult> {
  return serveBuiltFile(distDir, "widget-app.js", "pnpm --filter @hexdev/widget-app run build");
}

/** The loader's own built classic-script IIFE bundle (Vite lib mode — see
 * `packages/widget-sdk/vite.config.ts`), served at `/loader.js` — the
 * literal URL a tenant's `<script src>` fetches. */
export function serveLoaderAsset(distDir: string): Promise<StaticAssetResult> {
  return serveBuiltFile(distDir, "loader.js", "pnpm --filter @hexdev/widget-sdk run build");
}
