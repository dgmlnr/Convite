import { existsSync, globSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BROWSER_TEST_INCLUDE } from "./browser-test-include.mjs";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..");

/**
 * Every `*.browser.test.ts` file physically on disk under `dir`, found by
 * walking the filesystem — never by re-listing package names, which is
 * exactly the enumeration this fence exists to make unnecessary.
 */
function findBrowserTestFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findBrowserTestFiles(full));
    } else if (entry.name.endsWith(".browser.test.ts")) {
      found.push(full);
    }
  }
  return found;
}

/** The nearest ancestor package's name, so a failure names WHICH package is
 * uncovered, not just a raw file path buried in a diff. */
function packageNameFor(filePath: string): string {
  let dir = path.dirname(filePath);
  while (dir.length >= repoRoot.length) {
    const packageJsonPath = path.join(dir, "package.json");
    if (existsSync(packageJsonPath)) {
      const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: string };
      return manifest.name ?? path.relative(repoRoot, dir);
    }
    if (dir === repoRoot) break;
    dir = path.dirname(dir);
  }
  return path.relative(repoRoot, path.dirname(filePath));
}

describe("vitest.config.ts browser project coverage", () => {
  it("includes every *.browser.test.ts file on disk, for every current and future package", () => {
    const onDisk = [...findBrowserTestFiles(path.join(repoRoot, "packages")), ...findBrowserTestFiles(path.join(repoRoot, "apps"))].map((file) =>
      path.relative(repoRoot, file).split(path.sep).join("/"),
    );

    const matched = new Set(
      BROWSER_TEST_INCLUDE.flatMap((pattern) => globSync(pattern, { cwd: repoRoot })).map((file) => file.split(path.sep).join("/")),
    );

    const uncovered = onDisk.filter((file) => !matched.has(file)).map((file) => `${packageNameFor(path.join(repoRoot, file))}: ${file}`);

    expect(uncovered.sort()).toEqual([]);
  });
});
