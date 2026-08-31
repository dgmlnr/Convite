import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serveTileFrontAsset } from "./static-tile-assets.js";

/**
 * THE THREAT-MATRIX ROW FOR THIS ROUTE, and it is the only applicable one the
 * change has: a static asset path is the sole place a request name decides
 * which bytes leave the process.
 *
 * Two independent layers, and these are the second. `resolveRoute` already
 * refuses `""`, `/`, `\`, `..` and `%2f` before a route object exists; this
 * accepts ONLY membership in a Set derived from `tileId()`, so nothing
 * outside the 42 can reach `readFile` even if the first layer were removed.
 * Failure is a 404 with no path in the body, never an error naming a
 * directory.
 */
describe("serveTileFrontAsset (the widget-app bundle resolves tile art at runtime from its OWN served location — /assets/tiles/<tileId>.webp — never bundled inline)", () => {
  let assetsDir: string;

  beforeEach(() => {
    assetsDir = mkdtempSync(join(tmpdir(), "tile-fronts-"));
  });

  afterEach(() => {
    rmSync(assetsDir, { recursive: true, force: true });
  });

  it("serves a real tile face with a webp content-type", async () => {
    writeFileSync(join(assetsDir, "5-circles.webp"), Buffer.from([1, 2, 3]));
    const result = await serveTileFrontAsset(assetsDir, "5-circles.webp");
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("image/webp");
    expect(result.body).toEqual(Buffer.from([1, 2, 3]));
  });

  it("serves every one of the bonus faces too, which is where an id shape usually breaks", async () => {
    for (const filename of ["flower-bamboo.webp", "season-winter.webp", "dragon-white.webp", "wind-north.webp"]) {
      writeFileSync(join(assetsDir, filename), Buffer.from([7]));
      const result = await serveTileFrontAsset(assetsDir, filename);
      expect(result.status, filename).toBe(200);
    }
  });

  /**
   * THE CASE A BARE `/\.webp$/` WOULD ACCEPT. A regex over the extension is
   * the shape the deck route's neighbour reaches for, and it cannot be
   * proven sound — only complete. A derived Set answers this one correctly
   * without anybody having to think about it.
   */
  it("refuses a right-extension, wrong-name file even when it really is on disk", async () => {
    writeFileSync(join(assetsDir, "10-circles.webp"), Buffer.from([9]));
    const result = await serveTileFrontAsset(assetsDir, "10-circles.webp");
    expect(result.status).toBe(404);
  });

  /**
   * EVERY REFUSAL CASE PUTS THE FILE ON DISK FIRST, and that is not padding.
   * A name this route rejects would 404 anyway when `readFile` fails, so a
   * refusal asserted against a MISSING file passes for the wrong reason and
   * cannot tell a real filter from no filter at all — measured: the first
   * draft of these two cases stayed green when the Set was swapped for a bare
   * `/\.webp$/`.
   */
  it("refuses a plausible-looking face that is not one of the 42, even sitting right there", async () => {
    for (const filename of ["dragon-blue.webp", "wind-northeast.webp", "0-circles.webp"]) {
      writeFileSync(join(assetsDir, filename), Buffer.from([9]));
      expect((await serveTileFrontAsset(assetsDir, filename)).status, filename).toBe(404);
    }
  });

  it("refuses a real face under any other extension, even sitting right there", async () => {
    for (const filename of ["5-circles.svg", "5-circles"]) {
      writeFileSync(join(assetsDir, filename), Buffer.from([9]));
      expect((await serveTileFrontAsset(assetsDir, filename)).status, filename).toBe(404);
    }
  });

  it("refuses a traversal before ever touching the filesystem", async () => {
    writeFileSync(join(assetsDir, "..", "tile-secret.txt"), "should never be served");
    expect((await serveTileFrontAsset(assetsDir, "../tile-secret.txt")).status).toBe(404);
    expect((await serveTileFrontAsset(assetsDir, "../../etc/passwd")).status).toBe(404);
    rmSync(join(assetsDir, "..", "tile-secret.txt"));
  });

  it("refuses an empty name", async () => {
    expect((await serveTileFrontAsset(assetsDir, "")).status).toBe(404);
  });

  it("404s a real face whose file is missing, without naming the path it looked in", async () => {
    const result = await serveTileFrontAsset(assetsDir, "1-bamboo.webp");
    expect(result.status).toBe(404);
    expect(String(result.body)).not.toContain(assetsDir);
  });
});
