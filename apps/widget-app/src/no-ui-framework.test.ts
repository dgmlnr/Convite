import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGE_DIR = fileURLToPath(new URL("../", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Domain F/M, task 13b.8/13b.9: no shadcn/React dependency reaches
 * `apps/widget-app`'s bundle. `.dependency-cruiser.cjs`'s
 * `no-ui-framework-outside-admin` (task 13b.7) already fences this at the
 * SOURCE-import level for every file in the repo; this test is the
 * complementary, cheaper signal at the package-manifest level, run every
 * `pnpm test` with no build step: `apps/widget-app`'s own `package.json`
 * cannot declare react/react-dom/@radix-ui/tailwindcss at all, which makes
 * a value import of any of them fail to resolve under pnpm's isolated
 * `node_modules` before a single byte of a bundle is ever produced — the
 * same "structurally cannot" argument `no-pg-outside-platform-core` and
 * `browser-safety.test.ts`'s `NODE_ONLY_PACKAGES` already rely on.
 *
 * The REAL, black-box proof — the actual built `dist-app/widget-app.js`
 * inspected for these substrings, and its byte size compared against the
 * eight-slice-old 518.15 kB baseline — is a manual Definition of Done step
 * (`pnpm --filter @hexdev/widget-app run build`), not this test: `pnpm
 * test` never builds a Vite bundle as part of itself anywhere in this
 * repo, and adding that cost here would be a new pattern this fence does
 * not need in order to mean something.
 */
const FORBIDDEN_UI_FRAMEWORK_PACKAGES = ["react", "react-dom", "tailwindcss"] as const;

function widgetAppManifest(): Readonly<Record<string, unknown>> {
  return JSON.parse(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8")) as Record<string, unknown>;
}

function declaredDependencyNames(manifest: Readonly<Record<string, unknown>>): readonly string[] {
  const deps = (manifest["dependencies"] ?? {}) as Record<string, string>;
  const devDeps = (manifest["devDependencies"] ?? {}) as Record<string, string>;
  return [...Object.keys(deps), ...Object.keys(devDeps)];
}

describe("apps/widget-app never declares a UI-framework dependency (Domain F/M)", () => {
  it("fence setup: this really is apps/widget-app's own manifest, and it declares something", () => {
    const manifest = widgetAppManifest();
    expect(manifest["name"]).toBe("@hexdev/widget-app");
    expect(declaredDependencyNames(manifest).length).toBeGreaterThan(5);
  });

  it.each(FORBIDDEN_UI_FRAMEWORK_PACKAGES)("declares no dependency named %s", (pkg) => {
    expect(declaredDependencyNames(widgetAppManifest())).not.toContain(pkg);
  });

  it("declares no @radix-ui/* dependency", () => {
    const offenders = declaredDependencyNames(widgetAppManifest()).filter((name) => name.startsWith("@radix-ui/"));
    expect(offenders).toEqual([]);
  });

  /**
   * apps/admin is the ONLY app that may declare these (decision #3684 item
   * 5a) — confirmed here so this test cannot pass merely because nobody in
   * the whole repo uses them yet, which would make every assertion above
   * vacuous. Read from apps/admin's own manifest by real path, never
   * hand-typed, so this stays true if that manifest's dependency SET
   * changes shape later.
   */
  it("fence setup: apps/admin really does declare react (so the assertions above are not vacuous)", () => {
    const adminManifest = JSON.parse(readFileSync(join(REPO_ROOT, "apps/admin/package.json"), "utf8")) as Record<string, unknown>;
    expect(declaredDependencyNames(adminManifest)).toContain("react");
  });
});
