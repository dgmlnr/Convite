import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serveLoaderAsset, serveWidgetAppAsset } from "./static-widget-app.js";

describe("serveWidgetAppAsset (spec: widget-embed — the iframe needs real content to mount)", () => {
  let distDir: string;

  beforeEach(() => {
    distDir = mkdtempSync(join(tmpdir(), "widget-app-dist-"));
  });

  afterEach(() => {
    rmSync(distDir, { recursive: true, force: true });
  });

  it("serves the built widget-app.js bundle with a JS content-type", async () => {
    writeFileSync(join(distDir, "widget-app.js"), "console.log('real bundle');");
    const result = await serveWidgetAppAsset(distDir);
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("text/javascript; charset=utf-8");
    expect(result.body.toString()).toBe("console.log('real bundle');");
  });

  it("returns 404 with an actionable message when the bundle has not been built yet", async () => {
    const result = await serveWidgetAppAsset(distDir);
    expect(result.status).toBe(404);
    expect(result.body.toString()).toContain("pnpm --filter @hexdev/widget-app run build");
  });
});

describe("serveLoaderAsset (spec: widget-embed — the <script> tag itself must be fetchable)", () => {
  let distDir: string;

  beforeEach(() => {
    distDir = mkdtempSync(join(tmpdir(), "widget-sdk-dist-"));
  });

  afterEach(() => {
    rmSync(distDir, { recursive: true, force: true });
  });

  it("serves the built loader.js IIFE bundle with a JS content-type", async () => {
    writeFileSync(join(distDir, "loader.js"), "(function(){/* real iife */})();");
    const result = await serveLoaderAsset(distDir);
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("text/javascript; charset=utf-8");
    expect(result.body.toString()).toBe("(function(){/* real iife */})();");
  });

  it("returns 404 with an actionable message when the loader has not been built yet", async () => {
    const result = await serveLoaderAsset(distDir);
    expect(result.status).toBe(404);
    expect(result.body.toString()).toContain("pnpm --filter @hexdev/widget-sdk run build");
  });
});
