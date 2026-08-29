import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// `dist`/`dist-app`/`dist-iife` are build output, never a package boundary —
// `dist-app` (apps/widget-app) and `dist-iife` (packages/widget-sdk) are
// named the same way `eslint.config.js`'s own ignore list already does.
const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "dist-app", "dist-iife"]);

/**
 * Every workspace member below `root`, found by walking the filesystem for
 * `package.json` files — never by re-reading `pnpm-workspace.yaml`'s glob
 * patterns or a hardcoded package list. A directory holding its own
 * `package.json` is treated as a package boundary and not descended into
 * further, so a package's own nested folders are never mistaken for
 * separate workspace members.
 */
export function findWorkspacePackages(root) {
  const packages = [];
  walk(root);
  return packages;

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || SKIP_DIR_NAMES.has(entry.name)) continue;
      const dirPath = path.join(dir, entry.name);
      const packageJsonPath = path.join(dirPath, "package.json");
      if (existsSync(packageJsonPath)) {
        const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
        packages.push({ dir: dirPath, tsconfigPath: path.join(dirPath, "tsconfig.json"), name: manifest.name, manifest });
      } else {
        walk(dirPath);
      }
    }
  }
}

/**
 * Every `workspace:*`-declared dependency name a package.json lists, from
 * either `dependencies` or `devDependencies` — a devDependency still needs a
 * real `tsc -b` project reference, as `apps/server`'s own
 * `@hexdev/escoba-engine` devDependency already proves.
 */
export function workspaceDependencyNamesOf(manifest) {
  const deps = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
  return Object.keys(deps).filter((name) => deps[name].startsWith("workspace:"));
}
