/**
 * The static HTML shell served at `GET /embed` for a real browser navigation
 * (an `Accept: text/html` request — see `index.ts`'s content-negotiation
 * branch). Content is identical on every request (no per-request bootstrap
 * data inlined): the widget-app bundle itself reads `k`/`o` off its OWN
 * `location.search` — the SAME query string this navigation arrived with —
 * and calls back to `/embed` a second time with `Accept: application/json`
 * to mint its session token and fetch its catalog. This keeps the shell
 * trivially cacheable and keeps `/embed`'s two response shapes (HTML vs
 * JSON) independent of each other.
 */
export function renderEmbedShell(): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>hexdev-gamify</title>
</head>
<body>
<div id="hexdev-gamify-app"></div>
<script type="module" src="/assets/widget-app.js"></script>
</body>
</html>
`;
}
