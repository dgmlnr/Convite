import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

/**
 * Screenshot-based visual regression, deliberately its OWN opt-in project —
 * the same "not part of `pnpm test`" discipline `vitest.e2e.config.ts` and
 * `vitest.redis.config.ts` already established, for a genuinely different
 * reason here: a screenshot test is only as trustworthy as the baseline it
 * compares against, and a baseline needs a human's deliberate `--update` plus
 * a reviewed diff (`visual/README.md`), never a silent side effect of the
 * everyday `pnpm test` TDD loop. Run explicitly with `pnpm test:visual`.
 *
 * MECHANISM: Vitest Browser Mode's own `toMatchScreenshot()` matcher, real
 * Chromium via the SAME `@vitest/browser-playwright` provider the unit
 * "browser" project (`vitest.config.ts`) already uses. Chosen over adding
 * `@playwright/test` (its own `toHaveScreenshot()` is NOT available here —
 * only bare `playwright` and `@vitest/browser-playwright` are installed,
 * `@playwright/test` is not a dependency of this repo) because Vitest's own
 * matcher already provides everything this suite needs — stable-screenshot
 * retry, baseline diffing, an `--update` workflow — with zero new tooling
 * and zero new devDependencies.
 */
export default defineConfig({
  test: {
    name: "visual",
    include: ["packages/**/*.visual.test.ts", "apps/**/*.visual.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    setupFiles: ["./visual/setup.ts"],
    // A genuine mismatch report (screenshot + diff generation) takes longer
    // than Vitest's 5s default test timeout, which was surfacing as an
    // ambiguous "Test timed out" instead of a real diff on a real
    // regression — raised so a failure always resolves into an actual
    // mismatch report.
    testTimeout: 30_000,
    browser: {
      enabled: true,
      // Headless UNCONDITIONALLY — unlike the unit "browser" project, which
      // follows `process.env.CI` (headed locally). A headed vs. headless
      // Chromium can rasterize text slightly differently; a baseline
      // generated headed on a dev machine must not silently disagree with a
      // headless CI run of the exact same fixture.
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      expect: {
        toMatchScreenshot: {
          comparatorName: "pixelmatch",
          comparatorOptions: {
            // A small tolerance for residual anti-aliasing/hinting noise
            // between otherwise-identical runs and machines — NOT a licence
            // for cross-OS drift, see visual/README.md. A real regression
            // (a colour swap, a missing element, the opacity-over-cloth bug
            // this suite exists to catch) moves far more than 1% of an
            // element's pixels.
            allowedMismatchedPixelRatio: 0.01,
          },
        },
      },
    },
  },
});
