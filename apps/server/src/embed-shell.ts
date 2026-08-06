import type { CatalogEntry } from "./catalog.js";

export interface EmbedBootstrap {
  readonly token: string;
  readonly playerId: string;
  readonly catalog: readonly CatalogEntry[];
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
<title>hexdev-gamify</title>
</head>
<body>
${body}
</body>
</html>
`;
}
