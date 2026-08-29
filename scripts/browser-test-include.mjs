/**
 * The `include` patterns for `vitest.config.ts`'s `browser` project, pulled
 * into their own module for one reason: so `browser-test-include.test.ts`
 * can assert they cover every `*.browser.test.ts` file that actually exists
 * on disk, not just today's five packages.
 *
 * This used to be a literal, per-package list — `packages/games/truco-engine/**`,
 * `packages/games/truco-ui/**`, `packages/games/escoba-ui/**`,
 * `packages/widget-sdk/**`, `apps/widget-app/**` — grown one line at a time
 * as each package earned browser tests. A package with `.browser.test.ts`
 * files that forgot its own line ran ZERO tests, in silence, and `pnpm test`
 * stayed green: see `gotchas/vitest-enumera-paquetes-browser`. Two globs
 * replace the whole list: every `*.browser.test.ts` file anywhere under
 * `packages/` or `apps/` is covered the day it is written, with nothing to
 * add per package.
 */
export const BROWSER_TEST_INCLUDE = ["packages/**/*.browser.test.ts", "apps/**/*.browser.test.ts"];
