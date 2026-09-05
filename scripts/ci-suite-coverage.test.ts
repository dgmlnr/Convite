import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..");

/**
 * EVERY VITEST SUITE IN THIS REPOSITORY IS EITHER RUN BY CI OR HAS A REASON.
 *
 * The gap this closes was measured, not imagined. `vitest.e2e.config.ts`,
 * `vitest.redis.config.ts` and `vitest.visual.config.ts` all predate
 * `.github/workflows/ci.yml` (`857c3c7`, `bb65d77`, `240b395` against
 * `353073f`), so the day the workflow was written three suites needed a
 * decision and only one got one. `vitest.scenes.config.ts` (`6b5a1fd`) landed
 * AFTER the workflow and got none either. Nothing said so, anywhere.
 *
 * WHAT IT COST, AND IT WAS PAID. `pnpm test:e2e` was found RED on `main`
 * itself: three of its six spec files failed, deterministically, and they had
 * been failing for long enough that nobody could say when it started —
 * because nothing re-ran them. A suite outside CI does not stay a "local-only
 * gate"; it rots into a suite nobody can run at all, and the rot is invisible
 * precisely because it is outside CI.
 *
 * Those specs are fixed and the suite now has its own job, which is what this
 * entry always said would close it. None of the four was a defect in the
 * product: two counted a rendered hand before waiting for one, one was
 * scoped to a card heading the lobby refactor had rewritten, and the
 * solitaire's own auto-player leaned on a widget behaviour that was itself a
 * bug. That last one is the whole argument for the job in one sentence — a
 * change made deliberately, in a package with its own green fences, walked
 * past a spec nothing re-ran.
 *
 * THIS FENCE DOES NOT DECIDE, exactly like
 * `dependency-cruiser-layer-coverage.test.ts` does not decide a package's
 * tier. Whether a suite belongs in CI depends on what it costs and what it
 * proves, which is a judgement no test can make. It only forces the decision
 * to be WRITTEN DOWN: a suite config with no entry below fails here, named,
 * instead of quietly never running again.
 *
 * The configs are discovered from the filesystem, never listed — a list of
 * "the suites we have today" would reproduce the enumerating-config defect
 * this fence exists to close. The VERDICTS are necessarily written by hand,
 * because they are decisions; the set of things needing a verdict is not.
 */

interface SuiteTriage {
  /** The `package.json` script that runs this suite. */
  readonly script: string;
  /** The exact command `.github/workflows/ci.yml` runs it with, or `null`
   * when CI deliberately does not run it. */
  readonly ciCommand: string | null;
  /** Required when `ciCommand` is `null`: why not, and what would change it. */
  readonly reason?: string;
}

const TRIAGE: Readonly<Record<string, SuiteTriage>> = {
  "vitest.config.ts": {
    script: "test",
    // CI invokes the two projects directly rather than through `pnpm test`,
    // because it splits the typecheck and lint steps out so a failure in one
    // is legible without reading the other's log.
    ciCommand: "vitest run --project node --project browser",
  },
  "vitest.visual.config.ts": {
    script: "test:visual",
    ciCommand: "pnpm run test:visual",
  },
  "vitest.e2e.config.ts": {
    script: "test:e2e",
    ciCommand: "pnpm run test:e2e",
  },
  "vitest.postgres.config.ts": {
    script: "test:postgres",
    ciCommand: "pnpm run test:postgres",
  },
  "vitest.redis.config.ts": {
    script: "test:redis",
    ciCommand: null,
    reason:
      "It requires a real Redis in Docker and has no fallback path (`redis-tests/global-setup.ts`). The runner would need a " +
      "service container, which is a real cost for a suite whose whole point is that the DEFAULT in-memory deployment needs no " +
      "new infrastructure. Worth revisiting the day a Redis deployment is the one being shipped rather than an adapter that " +
      "exists beside it.",
  },
  "vitest.scenes.config.ts": {
    script: "visual:review",
    ciCommand: null,
    reason:
      "It renders screens for a PERSON to look at and compares nothing — its own header says so: every run writes fresh images " +
      "with `--update` into a gitignored directory. There is no verdict for CI to read, so running it there would burn minutes " +
      "producing artefacts nobody opens. It also still `mergeConfig`s the visual config and concatenates its `include`, so it " +
      "runs the four committed baselines too; putting it in CI would give a second, weaker job an opinion about them.",
  },
};

/** Every vitest project config at the repository root, from disk. */
function suiteConfigs(): readonly string[] {
  return readdirSync(repoRoot)
    .filter((entry) => /^vitest\..*config\.ts$/.test(entry))
    .sort();
}

const workflow = (): string => readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");

/**
 * THE WORKFLOW'S INSTRUCTIONS, WITHOUT ITS PROSE — and this is not a nicety.
 * The first version of this fence read the whole file, so the comment that
 * explains why `pnpm test:e2e` is absent made the fence report that CI runs
 * it. A rule about what a file DOES cannot be checked against text that only
 * talks about it, and the same paragraph would have had to stop naming the
 * command it exists to explain.
 */
function stepsOnly(yaml: string): string {
  return yaml
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

const workflowSteps = (): string => stepsOnly(workflow());

const packageScripts = (): Readonly<Record<string, string>> =>
  (JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;

describe("every vitest suite is either run by CI or has a written reason", () => {
  it("finds the suite configs and the workflow it is asking about", () => {
    // R6, sized against the collection it guards. A `readdirSync` that found
    // nothing, or a workflow path that moved, would make every assertion
    // below pass while checking nothing at all.
    const configs = suiteConfigs();
    expect(configs.length, "fence setup: no vitest project config was found at the repository root").toBeGreaterThan(1);
    expect(configs).toContain("vitest.config.ts");
    expect(workflow().length, "fence setup: .github/workflows/ci.yml was read as empty").toBeGreaterThan(0);
  });

  it("reads the workflow's instructions and not its prose", () => {
    // R18, and the case is real rather than illustrative: the first version
    // of this fence read the raw file and concluded that CI runs `test:e2e`,
    // because the paragraph explaining its absence names it.
    const sample = ["# the reason `pnpm test:e2e` is absent, spelled out", "      - name: Tests", "        run: pnpm exec vitest run --project node"].join("\n");
    expect(stepsOnly(sample)).not.toContain("pnpm test:e2e");
    expect(stepsOnly(sample), "the stripper ate a real step").toContain("run: pnpm exec vitest run --project node");
    // …and the real workflow really does carry prose, so the stripper is not
    // a no-op that happens to look correct.
    expect(workflowSteps().length, "fence setup: ci.yml has no comments, so this mechanism proves nothing about it").toBeLessThan(workflow().length);
  });

  it("gives every suite config on disk a verdict, and every verdict a suite config", () => {
    // Both directions, the same way the tile licence audit compares the
    // manifest to the real directory: one way catches a new suite nobody
    // triaged, the other catches a verdict left behind by a rename.
    const configs = suiteConfigs();
    expect(
      configs.filter((config) => !(config in TRIAGE)),
      "a vitest suite config with no entry in TRIAGE: decide whether CI runs it, and write the decision down here",
    ).toEqual([]);
    expect(
      Object.keys(TRIAGE).filter((config) => !configs.includes(config)),
      "TRIAGE names a suite config that is not on disk any more",
    ).toEqual([]);
  });

  it("names a real package.json script for every suite", () => {
    const scripts = packageScripts();
    expect(Object.keys(scripts).length, "fence setup: package.json declared no scripts").toBeGreaterThan(0);
    expect(
      Object.entries(TRIAGE)
        .filter(([, triage]) => !(triage.script in scripts))
        .map(([config, triage]) => `${config} -> ${triage.script}`),
      "TRIAGE names a script package.json does not have",
    ).toEqual([]);
  });

  it("runs, in CI, exactly the commands it claims to run", () => {
    const ci = workflowSteps();
    expect(
      Object.entries(TRIAGE)
        .filter(([, triage]) => triage.ciCommand !== null && !ci.includes(triage.ciCommand))
        .map(([config, triage]) => `${config} claims CI runs \`${String(triage.ciCommand)}\`, and the workflow does not`),
      "a suite recorded as covered by CI that the workflow does not actually run",
    ).toEqual([]);
  });

  it("does not run, in CI, the suites it says it leaves out — and says why for each", () => {
    // The other direction, and it is the one that keeps the record honest
    // rather than merely present: adding the job without flipping the entry
    // fails here, which is a two-line fix and exactly the moment to delete a
    // reason that has stopped being true.
    const ci = workflowSteps();
    const excluded = Object.entries(TRIAGE).filter(([, triage]) => triage.ciCommand === null);
    expect(excluded.length, "fence setup: no suite is recorded as excluded, so this test asserts nothing").toBeGreaterThan(0);
    expect(
      excluded.filter(([, triage]) => ci.includes(`run ${triage.script}`) || ci.includes(`pnpm ${triage.script}`)).map(([config]) => config),
      "the workflow runs a suite TRIAGE records as excluded — update the entry",
    ).toEqual([]);
    expect(
      excluded.filter(([, triage]) => (triage.reason ?? "").length < 80).map(([config]) => config),
      "a suite is kept out of CI with no reason a reader could act on",
    ).toEqual([]);
  });
});
