import { parseTargetOrigin } from "@hexdev/widget-protocol";
import { initWidget } from "./loader.js";

/**
 * The ONE place this loader's peer origin is defined. Changing it is a
 * coordinated migration for every tenant's already-pasted `<script>` tag
 * (design "Expensive to reverse" table) — kept as a single named constant
 * so that cost stays visible rather than buried in a URL literal elsewhere.
 *
 * Overridable at IIFE BUILD time only (never at runtime) via `vite.config.ts`'s
 * `define`, so a real deployment's `loader.js` can point at its real widget
 * origin without a source edit per environment — see `globals.d.ts`.
 */
const DEFAULT_WIDGET_ORIGIN = "https://play.hexdev.example";
export const WIDGET_ORIGIN = parseTargetOrigin(
  typeof __HEXDEV_WIDGET_ORIGIN__ === "string" ? __HEXDEV_WIDGET_ORIGIN__ : DEFAULT_WIDGET_ORIGIN,
);

/**
 * The auto-init entry point a bundler wraps into the distributable IIFE
 * (design §3: `widget-sdk/loader.js`, Vite lib mode, `formats: ["iife"]` —
 * that bundling step is NOT wired in this unit; see apply-progress).
 *
 * Uses `document.currentScript` to find the tenant's own `<script>` tag —
 * the standard mechanism a classic script uses to identify itself.
 *
 * DISCLOSED PLATFORM CONSTRAINT: `document.currentScript` is ALWAYS `null`
 * for an ES module (`<script type="module">`), by spec — not a bug, not
 * testable around. This is exactly why design §3 calls for an IIFE
 * (classic script) build target rather than shipping this module as-is:
 * only the bundled classic script preserves `currentScript` at the moment
 * this function runs. Until that bundle step exists, `bootstrap()` is
 * proven safe (no-ops, never throws) but its auto-init path is NOT proven
 * end-to-end — there is no classic-script harness in this repo yet to
 * prove it against.
 */
export function bootstrap(): void {
  const currentScript = document.currentScript;
  if (!(currentScript instanceof HTMLScriptElement)) return;
  initWidget(currentScript, document, window, { widgetOrigin: WIDGET_ORIGIN });
}
