import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { findWorkspacePackages } from "./workspace-packages.mjs";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..");

interface ForbiddenRule {
  name: string;
  from?: { path?: string };
}

interface DependencyCruiserConfig {
  forbidden: ForbiddenRule[];
}

/**
 * `.dependency-cruiser.cjs`'s `forbidden` rules name packages by hand inside
 * `from.path` regexes to assign L0/L1/L2 tiers. A package nobody adds to any
 * rule is constrained by nothing — and depcruise still exits 0. Proven by
 * mutation in PR #98: `transport-colyseus-client` sat in NO layer rule for
 * months; importing an app from it still reported "no dependency violations
 * found", with the dependency count RISING (584 -> 585) — depcruise saw the
 * new edge and had no rule to judge it by.
 *
 * This fence does NOT decide a new package's tier — whether it is L0, L1 or
 * L2 depends on what the package is for, which is an architecture decision
 * no test can make. It only forces that decision: a `packages/*` member
 * matching no rule's `from.path` fails here, named, instead of landing
 * silently unguarded.
 *
 * `apps/**` is deliberately out of scope. Apps are the top composition-root
 * tier — nothing constrains them from above, so an app legitimately
 * appearing in no rule's `from` is correct, not a gap.
 *
 * Only rules with a `from.path` (a positive tier-membership pattern) count
 * as layer rules. `no-colyseus-outside-transport` uses `from.pathNot`
 * instead ("every package except the transport ones") — a blanket
 * cross-cutting import restriction, not a tier assignment. Counting it would
 * make every future package trivially "covered" by matching it, silently
 * defeating this fence.
 *
 * Packages are discovered from the filesystem via `findWorkspacePackages`,
 * never a hardcoded list — a list of "the packages covered today" would
 * reproduce the exact defect class this fence exists to close (see
 * `patrones/config-que-enumera-a-mano-falla-en-verde`). For each discovered
 * package, a representative source path is built and tested against every
 * layer rule's own `from.path` regex, so this fence keeps working even if a
 * rule is later rewritten into a different shape.
 */
describe(".dependency-cruiser.cjs layer rule coverage", () => {
  it("names every packages/* workspace member in at least one layer rule's from.path", async () => {
    const config = ((await import("../.dependency-cruiser.cjs")) as { default: DependencyCruiserConfig }).default;

    const layerRulePatterns = config.forbidden
      .filter((rule): rule is ForbiddenRule & { from: { path: string } } => typeof rule.from?.path === "string")
      .map((rule) => new RegExp(rule.from.path));

    const packages = findWorkspacePackages(path.join(repoRoot, "packages"));

    const uncovered = packages
      .map((pkg) => {
        const relDir = path.relative(repoRoot, pkg.dir).split(path.sep).join("/");
        const representativePath = `${relDir}/src/index.ts`;
        const covered = layerRulePatterns.some((pattern) => pattern.test(representativePath));
        return { pkg, relDir, representativePath, covered };
      })
      .filter((result) => !result.covered)
      .map(
        (result) =>
          `${result.pkg.name}: ${result.relDir} matches no .dependency-cruiser.cjs forbidden rule's from.path (checked against ${result.representativePath})`,
      );

    expect(uncovered.sort()).toEqual([]);
  });
});
