import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

import { stripCssCommentsPlugin } from "../../scripts/strip-css-comments.mjs";

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
  // Half of this bundle was prose. Every `*-styles.ts` argues its rules
  // beside the rules, in CSS comments, and a CSS comment inside a template
  // literal is not a comment to a minifier — it is string content, so it
  // shipped: 296 114 bytes in 471 comments, measured. The plugin removes
  // them from the BUNDLE and from nothing else; `scripts/strip-css-comments.mjs`
  // says why it parses instead of matching, and `scripts/bundle-budget.mjs`
  // fails if they ever come back.
  plugins: [stripCssCommentsPlugin()],
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
