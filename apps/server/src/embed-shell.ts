import type { ThemeOverride } from "@hexdev/widget-protocol";
import type { CatalogEntry } from "./catalog.js";

export interface EmbedBootstrap {
  readonly token: string;
  readonly playerId: string;
  readonly catalog: readonly CatalogEntry[];
  /** Design §10 PRIMARY theming path — server-delivered, applied by
   * `widget-app` directly, zero loader involvement. Already sanitized once
   * at `createStaticTenantRepository` construction (`tenant-auth.ts`); see
   * `embed-handler.ts`'s own comment for why. Absent entirely (never `{}`)
   * for a tenant with no theme configured — theming is optional. */
  readonly theme?: ThemeOverride;
}

/**
 * The HTML served at `GET /embed` for a real browser navigation (an
 * `Accept: text/html` request — see `index.ts`'s content-negotiation
 * branch). `bootstrap` is inlined directly as JSON rather than fetched by a
 * second request from inside the iframe: a SAME-ORIGIN `fetch()` from the
 * iframe back to its own server carries NO `Origin` header at all (verified
 * against a real browser, see `referer-origin.ts`'s doc comment) — inlining
 * at the one request that DOES carry verifiable origin evidence (this
 * navigation) is what makes tenant-origin validation actually work end to
 * end, not an optimization.
 *
 * `bootstrap === undefined` means the mint failed (unknown tenant, origin
 * not allowed, rate-limited) — there is nothing to boot, so no app script is
 * referenced at all, only a plain Spanish error message.
 */
export function renderEmbedShell(bootstrap: EmbedBootstrap | undefined): string {
  const body =
    bootstrap === undefined
      ? `<p>No se pudo cargar el juego. Comprobá que la página esté autorizada para este contenido.</p>`
      : `<div id="hexdev-gamify-app"></div>
<script>window.__HEXDEV_BOOTSTRAP__=${JSON.stringify(bootstrap)}</script>
<script type="module" src="/assets/widget-app.js"></script>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Juegos — HexDev</title>
<style>
/* BUG (found running a real two-origin session, verified with
 * getComputedStyle): with no stylesheet at all, html and body both compute
 * to background-color: rgba(0, 0, 0, 0) — fully transparent. Once the widget
 * expands to fullscreen (design's "inline that expands"), the HOST page's
 * own content shows through, overlapping and unreadable. This must apply
 * from the very first paint, before any theme handshake — hence a plain
 * fallback, not something only set later via applyThemeToRoot's inline
 * style. It still honors a tenant's own surface color once
 * applyThemeToRoot sets --gx-color-surface on the root element.
 */
html, body { margin: 0; background-color: var(--gx-color-surface, #ffffff); }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}
