/**
 * Global setup for the visual-regression suite (`pnpm test:visual`), wired
 * via `vitest.visual.config.ts`'s `setupFiles`. Runs INSIDE the browser
 * context (not Node). This project's browser mode gives every individual
 * test its own fresh iframe (isolation), so this module re-executes before
 * EVERY test, not just once per file — nothing here needs its own cleanup.
 *
 * Controls the two sources of flakiness that are common to every snapshot in
 * this suite, so each `*.visual.test.ts` file only has to worry about its
 * own fixture:
 *
 * 1. Animations, transitions, and the text caret. Real time elapsing between
 *    "render" and "screenshot" would otherwise make the captured frame
 *    depend on exactly how fast the machine taking it happened to be.
 * 2. Fonts. `--gx-font-family` defaults to `system-ui, sans-serif`
 *    (table-styles.ts, chrome-styles.ts), which resolves to a DIFFERENT
 *    installed font on every OS — a screenshot of text rendered in whatever
 *    font happened to be on the machine that generated the baseline is not a
 *    baseline anyone else can reproduce. Pinning one embedded font FILE
 *    (never an OS font name) removes glyph shape as a variable.
 *
 *    This does NOT remove sub-pixel anti-aliasing/hinting differences
 *    between OS font rasterizers (Linux FreeType vs. macOS CoreText vs.
 *    Windows DirectWrite) — pixelmatch's own tolerance
 *    (`vitest.visual.config.ts`) absorbs that residual noise. See
 *    `visual/README.md` for the full, honest portability statement.
 *
 * What this file deliberately does NOT do: seed a deal, mock the clock, or
 * touch anything about a specific component — fixture data belongs in each
 * test file, which is what keeps a baseline reviewable on its own.
 */

const FONT_FAMILY = "HexDev Visual Test Sans";
const FONT_URL = new URL("./fonts/DejaVuSans.woff2", import.meta.url).href;

const resetStyle = document.createElement("style");
resetStyle.textContent = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
  * { scrollbar-width: none !important; }
  *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
`;
document.head.appendChild(resetStyle);

// A real font FILE, loaded here rather than named and hoped-for — see the
// module doc above. `.load()` is left un-caught deliberately: a font that
// fails to load must fail every screenshot loudly (wrong glyphs on every
// baseline), never degrade silently to whatever the OS happens to offer.
const font = new FontFace(FONT_FAMILY, `url(${FONT_URL})`);
document.fonts.add(font);
await font.load();
await document.fonts.ready;

// Every stylesheet in this repo reads `var(--gx-font-family, system-ui,
// sans-serif)` (table-styles.ts, chrome-styles.ts) — setting the CUSTOM
// PROPERTY on the document root, not a bare `font-family` rule, wins through
// that `var()` fallback the exact same way a tenant's real theme token would
// (`theme.ts`'s `applyThemeToRoot`), so this pins text rendering without
// special-casing either stylesheet.
document.documentElement.style.setProperty("--gx-font-family", `'${FONT_FAMILY}', sans-serif`);
