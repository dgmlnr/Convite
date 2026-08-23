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
