import { describe, expect, it } from "vitest";
import { renderEmbedShell } from "./embed-shell.js";

describe("renderEmbedShell (spec: widget-embed — iframe is the boundary the loader mounts)", () => {
  it("references the widget-app bundle as a module script, so the browser actually executes it", () => {
    const html = renderEmbedShell();
    expect(html).toContain('<script type="module" src="/assets/widget-app.js"></script>');
  });

  it("declares the Spanish locale on the root element, since all user-facing copy is Spanish", () => {
    const html = renderEmbedShell();
    expect(html).toContain('<html lang="es">');
  });
});
