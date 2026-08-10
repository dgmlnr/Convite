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

  // Regression: this route used to serve with NO cache-control header at
  // all, unlike /loader.js (which already carries one, below) — every
  // tenant page's iframe re-fetched the full app bundle on every embed,
  // silently, forever. widget-app.js is a FIXED filename (never
  // content-hashed by the Vite build, see `apps/widget-app/vite.config.ts`),
  // so an aggressive/immutable cache would serve a stale bundle past a
  // deploy; a short, bounded `max-age` gets real caching benefit while
  // capping the staleness window — the exact same tradeoff `/loader.js`
  // already made, so this reuses that same duration for consistency.
  it("serves the bundle with a short, bounded cache-control (not content-hashed, so not immutable)", async () => {
    writeFileSync(join(distDir, "widget-app.js"), "console.log('real bundle');");
    const result = await serveWidgetAppAsset(distDir);
    expect(result.cacheControl).toBe("public, max-age=300");
  });

  it("does NOT cache the 404 'not built yet' response — a stale 404 would hide a real deploy", async () => {
    const result = await serveWidgetAppAsset(distDir);
    expect(result.cacheControl).toBeUndefined();
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

  it("serves the loader with a short, bounded cache-control (not content-hashed, so not immutable)", async () => {
    writeFileSync(join(distDir, "loader.js"), "(function(){/* real iife */})();");
    const result = await serveLoaderAsset(distDir);
    expect(result.cacheControl).toBe("public, max-age=300");
  });

  it("does NOT cache the 404 'not built yet' response — a stale 404 would hide a real deploy", async () => {
    const result = await serveLoaderAsset(distDir);
    expect(result.cacheControl).toBeUndefined();
  });
});
