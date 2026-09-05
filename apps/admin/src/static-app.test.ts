import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { contentTypeForAsset, serveBuiltAsset, serveIndexHtml } from "./static-app.js";

/**
 * `static-app.ts`'s own contract, proven against a REAL temporary directory
 * on disk — no mocked `fs`. A genuinely built `dist-ui/` (a real
 * `pnpm --filter @hexdev/admin run build:ui`) is what the manual runtime
 * harness serves through this exact module; this suite proves the file
 * lookup and content-type mapping without paying that build's own cost on
 * every `pnpm test` run.
 *
 * Genuine RED, confirmed before `static-app.ts` existed: `Cannot find
 * module './static-app.js'`.
 */
describe("static-app", () => {
  let distDirs: string[] = [];

  afterEach(() => {
    distDirs = [];
  });

  async function realDistDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "convite-admin-dist-ui-"));
    distDirs.push(dir);
    return dir;
  }

  describe("contentTypeForAsset", () => {
    it("maps every extension Vite's own build emits", () => {
      expect(contentTypeForAsset("index-abc123.js")).toBe("text/javascript; charset=utf-8");
      expect(contentTypeForAsset("index-abc123.css")).toBe("text/css; charset=utf-8");
      expect(contentTypeForAsset("logo.svg")).toBe("image/svg+xml");
    });

    it("falls back to a generic binary type for an unlisted extension, never a throw", () => {
      expect(contentTypeForAsset("mystery.bin")).toBe("application/octet-stream");
    });
  });

  describe("serveIndexHtml", () => {
    it("reads the real built index.html", async () => {
      const dir = await realDistDir();
      await writeFile(join(dir, "index.html"), "<!doctype html><title>Convite</title>", "utf8");

      const result = await serveIndexHtml(dir);

      expect(result).toEqual({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><title>Convite</title>" });
    });

    it("returns 404 with a build hint when dist-ui was never built", async () => {
      const dir = await realDistDir();
      const result = await serveIndexHtml(dir);
      expect(result.status).toBe(404);
      expect(result.body).toContain("pnpm --filter @hexdev/admin run build:ui");
    });
  });

  describe("serveBuiltAsset", () => {
    it("reads a real built asset file by its exact (already-sanitized) name", async () => {
      const dir = await realDistDir();
      await mkdir(join(dir, "assets"), { recursive: true });
      await writeFile(join(dir, "assets", "index-abc123.js"), "console.log('hola');", "utf8");

      const result = await serveBuiltAsset(dir, "index-abc123.js");

      expect(result.status).toBe(200);
      expect(result.contentType).toBe("text/javascript; charset=utf-8");
      expect(result.body.toString()).toBe("console.log('hola');");
    });

    it("returns 404 for a file that does not exist under assets/", async () => {
      const dir = await realDistDir();
      const result = await serveBuiltAsset(dir, "missing.js");
      expect(result.status).toBe(404);
    });
  });
});
