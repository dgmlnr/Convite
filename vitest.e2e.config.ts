import { defineConfig } from "vitest/config";

/**
 * A SEPARATE, opt-in vitest project (apply prompt: "not part of `pnpm
 * test`... deliberately excluded from the default run"). This file is
 * intentionally NOT referenced by `vitest.config.ts`'s `test.projects`, so
 * `pnpm test` (`vitest run`) never discovers it. Run it explicitly with
 * `pnpm test:e2e`.
 *
 * Unlike the root config's `node`/`browser` projects, this suite boots a
 * real server + a real static host-fixture server and drives real Chromium
 * via the plain `playwright` package (already a devDependency) — vitest is
 * only the runner here, not the thing rendering anything. `globalSetup`
 * builds both bundles and starts both servers exactly ONCE for the whole
 * run; individual specs only read the resulting connection info (see
 * `e2e/support/harness-info.ts`) and open real browser contexts against it.
 *
 * AND IT IS NOT IN CI EITHER, which is a SECOND decision and was never a
 * deliberate one. "Not part of `pnpm test`" is argued above and is sound —
 * a TDD loop must not spawn servers. "Not part of `.github/workflows/ci.yml`"
 * is a different question with a different answer, and for a long time it had
 * no answer at all: this file predates that workflow (`857c3c7` against
 * `353073f`), so the workflow simply never learned about it.
 *
 * WHAT THAT COST, measured rather than assumed: three of the six spec files
 * here fail at `main` — `reload-identity` (storage denied), `team-play` (the
 * 2v2 card's bot tier) and `token-renewal` (the hand never renders past the
 * TTL). `team-play`'s own comment still describes the one-screen lobby the
 * catalog-sections work replaced with two. Nothing caught any of it, because
 * a suite outside CI is a suite that only runs when somebody remembers, and
 * eventually nobody does.
 *
 * The full verdict — cost, flakiness, and what has to be true before a job
 * can land — is recorded in `scripts/ci-suite-coverage.test.ts`, which now
 * fails if any suite config in this repository has no verdict at all.
 */
export default defineConfig({
  test: {
    name: "e2e",
    environment: "node",
    include: ["e2e/**/*.e2e.test.ts"],
    globalSetup: ["./e2e/global-setup.ts"],
    // Serial, deliberately: three real Chromium-driving specs plus one
    // shared server process is a heavier resource profile than the unit
    // suite, and this suite's own value is in NOT being flaky — running
    // files one at a time removes cross-file resource contention as a
    // possible source of that.
    fileParallelism: false,
    // The single-player spec sets its own (`MATCH_TIMEOUT_MS + 30_000`);
    // this is the ceiling for every other e2e spec.
    testTimeout: 5 * 60_000,
    hookTimeout: 5 * 60_000,
  },
});
