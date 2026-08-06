import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const packageDir = fileURLToPath(new URL(".", import.meta.url));

/**
 * A real Vite APP-mode build (not lib mode — this produces a runnable page,
 * not a library), served by `apps/server`'s tiny static route
 * (`serveWidgetAppAsset`). Output goes to `dist-app/`, deliberately not
 * `dist/` (which `tsc -b` owns for this package) and not `dist-iife/`
 * (widget-sdk's own build output name, reused here only as a naming
 * convention, not a shared directory — see widget-sdk/vite.config.ts).
 *
 * Fixed, unhashed filenames (`widget-app.js`) are a deliberate choice: it
 * keeps `apps/server`'s static route a single, trivially reviewable file
 * read with zero manifest/glob logic, at the cost of the browser cache-
 * busting a content hash would normally give a production CDN deployment —
 * an acceptable, disclosed tradeoff for this unit's scope.
 */
export default defineConfig({
  build: {
    outDir: "dist-app",
    emptyOutDir: true,
    rollupOptions: {
      input: `${packageDir}src/main.ts`,
      output: {
        entryFileNames: "widget-app.js",
        assetFileNames: "widget-app[extname]",
      },
    },
  },
});
