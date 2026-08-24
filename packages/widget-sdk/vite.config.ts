import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// `"type": "module"` makes this file ESM, so `__dirname` is not a global
// here — the standard replacement.
const packageDir = fileURLToPath(new URL(".", import.meta.url));

/**
 * Produces the ONE artifact a tenant's `<script>` tag actually fetches
 * (design §3: "Vite lib mode, `formats: ['iife']` — a classic script, zero
 * deps, tiny"). `document.currentScript` is `null` for any ES module by
 * spec (`bootstrap.ts`'s own doc comment) — this is why a classic-script
 * build is structurally required, not a preference.
 *
 * Output goes to `dist-iife/`, deliberately NOT `dist/`: `tsc -b` already
 * owns `dist/` for this package (its `.tsBuildInfoFile` lives there, obs
 * 2940), and `pnpm test` runs `tsc -b` on every invocation — writing the
 * Vite bundle into the same directory risks one build tool clobbering the
 * other's output on a clean/rebuild.
 *
 * `HEXDEV_WIDGET_ORIGIN` is a real environment variable at BUILD time (read
 * by Node while Vite's own config file executes), not a `VITE_`-prefixed
 * client-side env var — the built bundle has no client-side env system at
 * all, it is a static classic script. `define` bakes the value in as a
 * literal at bundle time (see `src/globals.d.ts`).
 */
export default defineConfig({
  define: {
    __HEXDEV_WIDGET_ORIGIN__: JSON.stringify(process.env.HEXDEV_WIDGET_ORIGIN ?? null),
  },
  build: {
    outDir: "dist-iife",
    emptyOutDir: true,
    lib: {
      entry: `${packageDir}src/auto-init.ts`,
      formats: ["iife"],
      name: "__conviteLoader",
      fileName: () => "loader.js",
    },
  },
});
