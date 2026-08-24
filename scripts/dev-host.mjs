/**
 * Serves a stand-in tenant page so the widget can be exercised by hand.
 *
 * The E2E harness builds its own host page on the fly, which means the
 * embedded product had no way to be opened by a human without reconstructing
 * that setup from the test sources. This script is that missing piece, and
 * nothing more: it is a development affordance, never part of the deployed
 * platform.
 *
 * The page deliberately does NOT look like a news site. The widget is meant
 * for any site at all, and a fixture that quietly assumes otherwise has led
 * this project's own decisions astray before.
 *
 * Usage:
 *   node scripts/dev-host.mjs [port]
 *
 * The port defaults to 5173 because that origin is in the dev tenant's
 * allowlist (`DEV_TENANT` in apps/server/src/config.ts). Serving from a port
 * that is not on the allowlist is not a bug in this script — the server is
 * supposed to refuse it.
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 5173);
const serverOrigin = process.env.HEXDEV_SERVER_ORIGIN ?? "http://localhost:2567";
const embedKey = process.env.HEXDEV_EMBED_KEY ?? "pk_dev_local";

const page = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sitio de prueba — HexDev Gamify</title>
<style>
  body { margin: 0; font: 16px/1.6 system-ui, sans-serif; color: #1b1b1b; background: #f4f2ee; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 1.6rem; margin: 0 0 4px; }
  .lede { color: #5a5a5a; margin: 0 0 28px; }
  .slot { min-height: 560px; border-radius: 14px; overflow: hidden; background: #fff; box-shadow: 0 2px 18px rgba(0,0,0,0.09); }
  .note { margin-top: 28px; font-size: 0.85rem; color: #6a6a6a; }
  code { background: #e7e4dd; padding: 1px 5px; border-radius: 4px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Sitio de prueba</h1>
  <p class="lede">Una página cualquiera que embebe el widget, para probarlo a mano.</p>

  <div class="slot" id="convite-slot">
    <script src="${serverOrigin}/loader.js" data-embed-key="${embedKey}" defer></script>
  </div>

  <p class="note">
    Clave de embed <code>${embedKey}</code>, servidor <code>${serverOrigin}</code>.
    Para probar el tema del host, agregá atributos <code>data-theme-*</code> al
    <code>&lt;script&gt;</code> de arriba.
  </p>
</div>
</body>
</html>`;

createServer((req, res) => {
  if (req.url === "/favicon.ico") {
    res.writeHead(204).end();
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(page);
}).listen(port, () => {
  process.stdout.write(`dev host page on http://localhost:${String(port)} (embedding ${serverOrigin})\n`);
});
