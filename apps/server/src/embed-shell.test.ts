import { describe, expect, it } from "vitest";
import { renderEmbedShell } from "./embed-shell.js";

const BOOTSTRAP = { token: "t1", playerId: "p1", catalog: [{ id: "truco-argentino", displayNameKey: "games.truco.name", seatCount: 2, configOptions: [] }] };

describe("renderEmbedShell (spec: widget-embed — the iframe needs real content AND its own session to mount)", () => {
  it("references the widget-app bundle as a module script, so the browser actually executes it", () => {
    const html = renderEmbedShell(BOOTSTRAP);
    expect(html).toContain('<script type="module" src="/assets/widget-app.js"></script>');
  });

  it("declares the Spanish locale on the root element, since all user-facing copy is Spanish", () => {
    const html = renderEmbedShell(BOOTSTRAP);
    expect(html).toContain('<html lang="es">');
  });

  it("inlines the minted bootstrap (token, playerId, catalog) as JSON the app script reads synchronously — no second /embed round trip needed", () => {
    const html = renderEmbedShell(BOOTSTRAP);
    expect(html).toContain(`window.__HEXDEV_BOOTSTRAP__=${JSON.stringify(BOOTSTRAP)}`);
  });

  it("renders a Spanish error page with no app script when the mint failed — nothing to boot without a token", () => {
    const html = renderEmbedShell(undefined);
    expect(html).not.toContain("/assets/widget-app.js");
    expect(html).toContain("No se pudo cargar el juego");
  });
});
