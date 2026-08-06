import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface StaticAssetResult {
  readonly status: number;
  readonly contentType: string;
  readonly body: Buffer | string;
}

/**
 * Serves the widget-app's own built browser bundle (a Vite app-mode build,
 * fixed output filename — see `apps/widget-app/vite.config.ts`). Deliberately
 * NOT a general static file server: there is exactly one servable path
 * (`/assets/widget-app.js`), so there is no path segment ever taken from a
 * request and joined onto a filesystem path — no path-traversal input
 * exists to sanitize at all, unlike a general asset server would need to.
 */
export async function serveWidgetAppAsset(distDir: string): Promise<StaticAssetResult> {
  try {
    const body = await readFile(join(distDir, "widget-app.js"));
    return { status: 200, contentType: "text/javascript; charset=utf-8", body };
  } catch {
    return {
      status: 404,
      contentType: "text/plain; charset=utf-8",
      body: "widget-app bundle not built — run `pnpm --filter @hexdev/widget-app run build`",
    };
  }
}
