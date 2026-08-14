import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          // `scripts/` is in here for one file: `scripts/vitest-runner.test.ts`.
          // The wrapper that decides how `pnpm test` launches Vitest lives
          // outside `packages/`/`apps/`, and it now gates every run in the
          // repo — including this one. Left out of `include` its test would
          // never execute, which is worse than not having written it.
          include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.ts"],
          // `.redis.test.ts` files require a real Redis (Docker container)
          // and run only via the separate `pnpm test:redis` project
          // (`vitest.redis.config.ts`) — the default unit suite stays
          // genuinely Redis-free, matching the in-memory default deployment.
          // `.visual.test.ts` files require the separate, opt-in
          // `pnpm test:visual` project (`vitest.visual.config.ts`) — same
          // "not part of `pnpm test`" discipline as `.redis.test.ts` below,
          // for the reason documented in that config's own header comment.
          exclude: ["**/*.browser.test.ts", "**/*.redis.test.ts", "**/*.visual.test.ts", "**/dist/**", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "browser",
          include: [
            "packages/games/truco-engine/**/*.browser.test.ts",
            "packages/games/truco-ui/**/*.browser.test.ts",
            "packages/widget-sdk/**/*.browser.test.ts",
            "apps/widget-app/**/*.browser.test.ts",
          ],
          exclude: ["**/node_modules/**"],
          browser: {
            enabled: true,
            // `headless` is deliberately LEFT UNSET, which means Vitest's own
            // default: follow `process.env.CI`. Headless in CI, headed on a
            // developer's machine.
            //
            // That is not an oversight, and setting `headless: true` here is
            // a trap worth naming, because it looks like an obvious tidy-up.
            // This project measures REAL LAYOUT — `table-height-stability`
            // asserts window heights to the hundredth of a pixel — and headed
            // and headless Chromium do not agree on them. Flipping it turns 14
            // of these tests red, and they fail for two different reasons that
            // are easy to conflate: a ~1.6px constant offset in the exact-height
            // constants (a plain metric difference, recalibratable), and a
            // 2.6875px growth partway through a played hand that headed does
            // not show at all — identical at every width, at the render where
            // the trick-feedback line appears. That second one is the very
            // thing this fence exists to forbid, so the constants must NOT be
            // recalibrated until it is understood: doing so would bury a real
            // question under a new number.
            //
            // Headed also happens to be the mode a player actually runs, which
            // is the mode a layout fence should be calibrated against.
            //
            // Nobody has to look at that window, though: `pnpm test` goes
            // through `scripts/run-vitest.mjs`, which runs this same headed
            // Chromium against a virtual display where one is available. The
            // window still exists and still renders identically — verified,
            // 28/28 here and 1013 on the full suite either way — it is simply
            // not on anyone's screen. `vitest.visual.config.ts` is a separate
            // project and pins `headless: true` for its own reason; see its
            // comment.
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
