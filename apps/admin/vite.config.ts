import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * The React/Vite/Tailwind v4 scaffold for `apps/admin`'s UI (task 13b.1,
 * design §13.1). Deliberately a SEPARATE build from this app's own
 * `tsc -b` output: the Node HTTP server (`src/index.ts` and everything it
 * imports) has nothing to do with a browser bundle and keeps compiling to
 * `dist/` exactly as it always has. `dist-ui/` is this build's own output
 * directory, matching `apps/widget-app`'s `dist-app/` naming convention —
 * a name `tsc -b` does not own, so the two builds never step on each other.
 *
 * `apps/admin` is the ONLY app in this repo that gets a UI framework
 * (decision #3684 item 5a — lifted on purpose, since nobody embeds the
 * panel); `.dependency-cruiser.cjs`'s `no-ui-framework-outside-admin`
 * (task 13b.7) is what keeps that scoped and reversible.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist-ui",
    emptyOutDir: true,
  },
});
