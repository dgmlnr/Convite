import { createRoot } from "react-dom/client";
import { themeTokensToCss } from "@hexdev/widget-protocol";

import { App } from "./App.js";
import "./globals.css";

/**
 * Emits `widget-protocol`'s own default `--gx-*` values once at boot
 * (design §13.3), as a plain `<style>` block rather than hand-typing them a
 * second time anywhere in this app — the single reason `DEFAULT_THEME_TOKENS`
 * exists (task 13a). No tenant override is applied here: this app styles
 * ITSELF, it never impersonates a tenant's own embed, so `themeTokensToCss`
 * is called with no argument at all.
 *
 * Ordering relative to `globals.css`'s own bundled `<style>`/`<link>` does
 * not matter: the two touch disjoint custom properties (`--gx-*` here,
 * `--background`/`--primary`/etc. there), so there is no cascade fight to
 * win — CSS custom property resolution reads the whole document's rules
 * together, not in insertion order, for properties that never collide.
 */
const gxDefaults = document.createElement("style");
gxDefaults.textContent = themeTokensToCss();
document.head.append(gxDefaults);

const container = document.getElementById("root");
if (container === null) throw new Error("apps/admin: index.html is missing #root — cannot mount the UI");

createRoot(container).render(<App />);
