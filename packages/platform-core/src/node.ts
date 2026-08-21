/**
 * The Node-ONLY entry point of this package.
 *
 * WHY IT EXISTS, and why it is not just another line in `index.ts`.
 * `apps/widget-app` depends on `@hexdev/platform-core` and is bundled for a
 * BROWSER. Every Redis adapter in this package is careful to write
 * `import type { Redis } from "ioredis"` — a type-only import, erased at
 * build time — precisely so that a browser bundle never pulls a Node client
 * library in. `connectRedis` cannot do that: it calls `new Redis(...)`, so
 * its import is a VALUE import.
 *
 * Re-exporting it from the main barrel put ioredis inside the widget bundle
 * (103 modules and 285 kB became 170 and 441 kB), and the widget then failed
 * to mount at all — the iframe stayed hidden with no console error anyone
 * could act on. That regression shipped, and this split is the fix: anything
 * that reaches for a Node runtime lives behind this path, where a browser
 * build cannot reach it by accident.
 *
 * `.dependency-cruiser.cjs` enforces the same rule mechanically, so this
 * docstring is not the only thing standing between the invariant and the
 * next edit.
 */
export { connectRedis } from "./redis-client.js";
