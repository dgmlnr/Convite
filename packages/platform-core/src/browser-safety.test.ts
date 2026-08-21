import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));

/**
 * `apps/widget-app` depends on this package and is bundled for a BROWSER, so
 * anything the public barrel can reach ends up in that bundle.
 *
 * Every Redis adapter here writes `import type { Redis } from "ioredis"`
 * on purpose: a type-only import is erased at build time, so the Node client
 * never travels. That discipline is invisible, and exactly one VALUE import
 * re-exported from `index.ts` undoes it silently.
 *
 * It is not hypothetical. `connectRedis` was added to the barrel, ioredis
 * landed in widget-app.js (103 modules and 285 kB became 170 and 441 kB),
 * and the widget stopped mounting entirely — the iframe stayed hidden with
 * nothing in the console to act on. Every unit test still passed, because
 * none of them bundle anything.
 *
 * This test is the guard, and it is deliberately NOT a dependency-cruiser
 * rule: that tool is configured with `doNotFollow: node_modules`, and a
 * workspace import written as `@hexdev/platform-core` resolves to the bare
 * specifier rather than to a file, so no `reachable` rule can cross a package
 * boundary here at all. A rule that cannot fire is decoration.
 */
const NODE_ONLY_PACKAGES = ["ioredis"];

function reExportedModules(): readonly string[] {
  const barrel = readFileSync(join(SRC, "index.ts"), "utf8");
  return [...barrel.matchAll(/from "\.\/([\w-]+)\.js"/g)].map((m) => `${m[1]}.ts`);
}

describe("the public barrel is safe to bundle for a browser", () => {
  it("re-exports something, so a broken regex cannot make this test vacuous", () => {
    expect(reExportedModules().length).toBeGreaterThan(5);
  });

  it.each(NODE_ONLY_PACKAGES)("never reaches a value import of %s", (pkg) => {
    const offenders = reExportedModules().filter((file) => {
      const source = readFileSync(join(SRC, file), "utf8");
      // A type-only import is erased at build time and is fine; a value
      // import is what travels into the bundle.
      return new RegExp(`^import\\s+(?!type\\b)[^;]*from\\s+"${pkg}"`, "m").test(source);
    });

    expect(offenders, `these modules are re-exported from index.ts and value-import ${pkg}, which would put it in the browser bundle`).toEqual([]);
  });

  /**
   * The Node-only surface must stay OUT of the barrel. Checked by name so the
   * test still means something if the file is renamed rather than deleted.
   */
  it("keeps the node-only entry point out of the barrel", () => {
    expect(readFileSync(join(SRC, "index.ts"), "utf8")).not.toMatch(/from "\.\/(node|redis-client)\.js"/);
  });

  it("still ships that entry point for the composition roots that need it", () => {
    expect(readdirSync(SRC)).toContain("node.ts");
    expect(readFileSync(join(SRC, "node.ts"), "utf8")).toMatch(/connectRedis/);
  });
});
