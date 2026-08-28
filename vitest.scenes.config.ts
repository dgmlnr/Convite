import { defineConfig, mergeConfig } from "vitest/config";
import visual from "./vitest.visual.config.js";

/**
 * THE SCENES: every screen a person may want to look at, rendered on demand
 * and never committed.
 *
 * These were baselines until the day `pixelmatch` was measured against this
 * design and found blind to it — a card that lost two thirds of its width
 * passed, because the comparator reads COLOUR DISTANCE and a panel here is
 * "the felt plus a few per cent of white". Their geometry moved to
 * `getBoundingClientRect()` assertions, which fail saying `expected 960 to be
 * 352` and need no threshold at all.
 *
 * What did NOT move is the value of looking at a whole screen. So the scenes
 * stayed, minus the thing that was not working: the committed baseline and
 * the comparison against it. `pnpm visual:review` renders them with
 * `--update`, so every run writes fresh images and compares nothing; the
 * output lands in a gitignored `__screenshots__/*.scene.test.ts/` and never
 * reaches a pull request.
 *
 * `vitest.visual.config.ts` keeps only the four screens a MEASUREMENT cannot
 * assert — two themed tenants, the match-over fill, and the drawn scoreboard.
 * Those are still real baselines, still compared, still in CI.
 */
export default mergeConfig(
  visual,
  defineConfig({
    test: {
      name: "scenes",
      include: ["packages/**/*.scene.test.ts", "apps/**/*.scene.test.ts"],
    },
  }),
);
