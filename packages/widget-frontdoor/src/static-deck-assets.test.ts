import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serveCardFrontAsset } from "./static-deck-assets.js";

describe("serveCardFrontAsset (the widget-app bundle resolves card art at runtime via a URL built from its OWN served location — /assets/fronts/<cardId>.webp — never bundled inline)", () => {
  let assetsDir: string;

  beforeEach(() => {
    assetsDir = mkdtempSync(join(tmpdir(), "deck-fronts-"));
  });

  afterEach(() => {
    rmSync(assetsDir, { recursive: true, force: true });
  });

  it("serves a real card front with a webp content-type", async () => {
    writeFileSync(join(assetsDir, "1-espada.webp"), Buffer.from([1, 2, 3]));
    const result = await serveCardFrontAsset(assetsDir, "1-espada.webp");
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("image/webp");
    expect(result.body).toEqual(Buffer.from([1, 2, 3]));
  });

  it("returns 404 for a filename that doesn't match any real card (no such file, not a traversal concern here)", async () => {
    const result = await serveCardFrontAsset(assetsDir, "13-espada.webp");
    expect(result.status).toBe(404);
  });

  it("rejects a path-traversal attempt before ever touching the filesystem — the filename must match the exact cardId shape", async () => {
    writeFileSync(join(assetsDir, "..", "secret.txt"), "should never be served");
    const result = await serveCardFrontAsset(assetsDir, "../secret.txt");
    expect(result.status).toBe(404);
    rmSync(join(assetsDir, "..", "secret.txt"));
  });

  it("rejects any extension other than .webp, even for an otherwise-valid rank/suit pair", async () => {
    const result = await serveCardFrontAsset(assetsDir, "1-espada.svg");
    expect(result.status).toBe(404);
  });
});
