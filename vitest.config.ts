import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
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
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
