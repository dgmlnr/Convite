// Resolver aliases that make dependency-cruiser see cross-package imports.
//
// WHY THIS FILE EXISTS
// --------------------
// This repo imports across workspace packages BY PACKAGE NAME
// (`import { x } from "@hexdev/platform-contract"`), never by relative path.
// dependency-cruiser could not resolve a single one of those, so every layer rule
// in `.dependency-cruiser.cjs` matched its `to: { path: "^(packages|apps)/" }`
// against an unresolved string that still literally read `@hexdev/...`, which that
// regex can never match. The fences reported "no dependency violations found" for
// months while being structurally blind: measured here, 127 of the graph's edges
// were raw specifiers carrying `couldNotResolve: true`, and the graph held 15
// phantom `@hexdev/*` nodes standing in for real packages. Written as a relative
// path instead, the very same import WAS caught — the rules only ever saw the form
// nobody writes.
//
// The root cause is dependency-cruiser's `exportsFields: []` default (see
// src/main/resolve-options/normalize.mjs), kept for enhanced-resolve 4/5
// backwards compatibility. Every workspace package here is `"type": "module"` with
// ONLY an `exports` map and no `main`/`module`, so with `exports` ignored there is
// nothing left to resolve and the specifier stays raw.
//
// WHY NOT SIMPLY TURN `exportsFields` ON
// --------------------------------------
// Because these packages' `exports` point at `dist/`, not `src/`, and
// `.dependency-cruiser.cjs` excludes `/dist/`. Measured: the edges then resolve
// into `dist/` and the exclusion silently eats them — 181 modules / 478
// dependencies becomes 166 / 352, and the rules STILL never fire. Dropping the
// `/dist/` exclusion instead makes the cruiser crawl build output: 823 modules,
// 1611 dependencies, and 18 bogus violations against compiled `.js` and `.d.ts`.
// Both outcomes are the same silent failure wearing a different costume.
//
// WHY A "WEBPACK" CONFIG AND NOT `enhancedResolveOptions`
// -------------------------------------------------------
// `alias` is exactly the right enhanced-resolve primitive here, but
// dependency-cruiser's own JSON schema declares `enhancedResolveOptions` with
// `additionalProperties: false` and permits only `exportsFields`, `conditionNames`,
// `extensions`, `mainFields`, `mainFiles`, `aliasFields` and `cachedInputFileSystem`
// — an `alias` key there is rejected outright with "must NOT have additional
// properties". The `webpackConfig` option is the supported way in:
// `extract-webpack-resolve-config.mjs` returns the config's `resolve` object
// wholesale and merges it into the enhanced-resolve options, so `alias` gets
// through. There is no webpack in this repo and this is not a build config — it is
// a resolver-alias carrier, named after what it does rather than after the option
// that happens to load it.
//
// The alias targets each package's `src` DIRECTORY rather than a specific entry
// file, and that is what keeps subpath imports working: `@hexdev/platform-core/node`
// resolves through the directory alias to `packages/platform-core/src/node.ts`.
// A `tsconfig.json` `paths` mapping cannot do that generically — TypeScript path
// patterns allow a single wildcard, so mapping `@hexdev/<star>` onto
// `packages/<star>/src/index.ts` turns `@hexdev/platform-core/node` into
// `packages/platform-core/node/src/index.ts` and leaves it unresolved (measured:
// 167 modules, with that one phantom node surviving). Covering it would mean
// hand-listing every subpath — the same per-package hand-maintenance that
// `gotchas/cercados-no-se-heredan-a-juego-nuevo` names as the enforcement gap to
// avoid.
//
// The alias map is DERIVED, never hand-written: the package roots come from
// `pnpm-workspace.yaml` and the package names from each `package.json`, so a
// package added tomorrow is fenced the day it is scaffolded. If a workspace glob
// ever stops being the shape this expander understands, it throws rather than
// quietly aliasing fewer packages — under-aliasing is precisely the blindness this
// file exists to end, so it must never happen silently.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads the package globs out of `pnpm-workspace.yaml` without pulling in a YAML
 * parser. Only the flat `packages:` sequence of trailing-wildcard entries this
 * workspace actually uses is understood; anything else throws.
 *
 * @returns {string[]} workspace root directories, relative to the repo root
 */
function workspaceRoots() {
  const yaml = readFileSync(join(import.meta.dirname, "pnpm-workspace.yaml"), "utf8");
  const packagesBlock = yaml.match(/^packages:\n((?:[ \t]+-.*\n?)+)/m);

  if (!packagesBlock) {
    throw new Error(
      ".dependency-cruiser-resolve.mjs: no `packages:` list found in pnpm-workspace.yaml, " +
        "so the depcruise layer rules would silently stop seeing cross-package imports.",
    );
  }

  return packagesBlock[1]
    .split("\n")
    .filter((line) => line.trim().startsWith("-"))
    .map((line) => line.trim().replace(/^-\s*/, "").replace(/^["']|["']$/g, ""))
    .map((glob) => {
      const root = glob.replace(/\/\*$/, "");
      if (root === glob || root.includes("*")) {
        throw new Error(
          `.dependency-cruiser-resolve.mjs: workspace glob "${glob}" is not the ` +
            "single-trailing-wildcard shape this expander understands. Teach it the new " +
            "shape — do not leave packages unaliased, because an unaliased package is one " +
            "the layer rules cannot see.",
        );
      }
      return root;
    });
}

/**
 * Maps every workspace package name to its `src` directory, so dependency-cruiser
 * resolves `@hexdev/<pkg>` to real first-party source instead of leaving it as an
 * unmatchable raw specifier.
 *
 * @returns {Record<string, string>} enhanced-resolve alias map
 */
function workspaceSourceAlias() {
  const alias = {};

  for (const root of workspaceRoots()) {
    const rootDirectory = join(import.meta.dirname, root);
    if (!existsSync(rootDirectory)) continue;

    for (const entry of readdirSync(rootDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const manifest = join(rootDirectory, entry.name, "package.json");
      const source = join(rootDirectory, entry.name, "src");
      if (!existsSync(manifest) || !existsSync(source)) continue;

      const { name } = JSON.parse(readFileSync(manifest, "utf8"));
      if (name) alias[name] = source;
    }
  }

  return alias;
}

export default { resolve: { alias: workspaceSourceAlias() } };
