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
            // asserts window heights to the hundredth of a pixel — and the two
            // modes did not always agree on them. The disagreement was never
            // about the browser: headed Chromium resolves `system-ui` to one
            // installed face and headless resolves it to another, and every
            // table box whose height was `line-height: normal` reported that
            // font's opinion instead of a layout constant. Chased to zero one
            // element at a time, each with a fence that pins the PROPERTY
            // rather than a number — `trick-feedback-line-box`,
            // `banner-lane-line-box`, `scoreboard-panel-line-box`,
            // `relation-label-line-box`. The last of those closed the final
            // symptom (the four 2v2 rows of `table-height-stability`, which
            // headless read 2.000000px taller than headed), so both modes now
            // measure identically and the whole suite is green either way.
            //
            // Headed stays the default anyway, for a reason that outlives that
            // history: it is the mode a player actually runs, and it is the
            // mode a layout fence should be calibrated against. A future
            // divergence between the two is a real signal, and it should be
            // read the way these four were — as a box whose height a font is
            // still deciding — never buried under recalibrated constants.
            //
            // Nobody has to look at that window, though: `pnpm test` goes
            // through `scripts/run-vitest.mjs`, which runs this same headed
            // Chromium against a virtual display where one is available. The
            // window still exists and still renders identically — verified,
            // 114 files / 1053 passed + 2 todo, the same totals under `pnpm
            // test` and `CI=1 pnpm test` — it is simply not on anyone's
            // screen. `vitest.visual.config.ts` is a separate project and pins
            // `headless: true` for its own reason; see its comment.
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
