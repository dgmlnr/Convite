import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { findWorkspacePackages, workspaceDependencyNamesOf } from "./workspace-packages.mjs";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..");

/**
 * TypeScript's `references` array has no glob form — unlike ESLint's `files`
 * blocks or dependency-cruiser's `from`/`to` regexes, there is nothing to
 * generalize here. This fence IS the whole fix: it derives, from every
 * package.json's own `workspace:*` dependencies, what each tsconfig.json's
 * `references` array MUST contain, and fails naming the exact missing pair
 * when it does not.
 *
 * `apps/widget-app/tsconfig.json` shipped without `escoba-engine`/`escoba-ui`
 * references for a whole slice while importing both — `tsc -b` (incremental)
 * stayed green because it resolved through already-built `.d.ts` files
 * instead of source, masking two real type errors. `tsc` is the floor every
 * other fence in this repo stands on; this is what keeps that floor honest.
 */
describe("tsconfig.json project references match workspace:* dependencies", () => {
  it("every package.json workspace:* dependency has a matching tsconfig.json references entry", () => {
    const packages = [...findWorkspacePackages(path.join(repoRoot, "packages")), ...findWorkspacePackages(path.join(repoRoot, "apps"))];
    const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));

    const missing: string[] = [];

    for (const pkg of packages) {
      const depNames = workspaceDependencyNamesOf(pkg.manifest);
      if (depNames.length === 0) continue;

      if (!existsSync(pkg.tsconfigPath)) {
        missing.push(`${pkg.name}: has workspace dependencies (${depNames.join(", ")}) but no tsconfig.json`);
        continue;
      }

      const tsconfig = JSON.parse(readFileSync(pkg.tsconfigPath, "utf8")) as { references?: { path: string }[] };
      const referencedDirs = new Set((tsconfig.references ?? []).map((ref) => path.resolve(pkg.dir, ref.path)));

      for (const depName of depNames) {
        const dep = byName.get(depName);
        if (dep === undefined) continue; // not a resolvable workspace member (e.g. an external package)
        if (!referencedDirs.has(dep.dir)) {
          missing.push(`${pkg.name} depends on ${depName} (workspace:*) but tsconfig.json's "references" has no entry for ${path.relative(repoRoot, dep.dir)}`);
        }
      }
    }

    expect(missing.sort()).toEqual([]);
  });
});
